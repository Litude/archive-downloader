import { DateTime } from "luxon";
import { getArchivedRecord } from "../archive-record/archive-record.js";
import { CaptureEntry } from "../types/capture-types.js";
import { computeSha256 } from "../utils/hash.js";

export function addValidationError(entry: CaptureEntry, error: string, details?: any) {
  if (!entry.metadata) {
    entry.metadata = {};
  }
  if (!entry.metadata.validationErrors) {
    entry.metadata.validationErrors = [];
  }
  entry.metadata.validationErrors.push({ type: error, details });
}

export function validateCaptureEntries(entries: CaptureEntry[]) {
  for (const entry of entries) {
    validateCaptureEntry(entry);
  }
}

export function validateCaptureEntry(entry: CaptureEntry) {
  if (entry.lastModified && entry.lastModified.diff(entry.captureTimestamp).as("hours") > 1) {
    addValidationError(entry, "last-modified-timestamp-future", {
      lastModified: entry.lastModified.toISO({ suppressMilliseconds: true }),
      captureTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
    });
  }

  if (entry.headerOutput?.original?.find(([k]) => k.toLowerCase() === "date")) {
    const serverDateHeader = entry.headerOutput.original.find(
      ([k]) => k.toLowerCase() === "date",
    )?.[1];
    const serverDate = serverDateHeader
      ? DateTime.fromHTTP(serverDateHeader, { zone: "utc" })
      : null;
    if (serverDate?.isValid && Math.abs(serverDate.diff(entry.captureTimestamp).as("months")) > 1) {
      addValidationError(entry, "server-date-timestamp-mismatch", {
        serverDate: serverDate.toISO({ suppressMilliseconds: true }),
        captureTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      });
    }
  }

  if (
    entry.mementoDateTime &&
    entry.mementoDateTime.toMillis() !== entry.captureTimestamp.toMillis()
  ) {
    addValidationError(entry, "memento-timestamp-mismatch", {
      mementoDateTime: entry.mementoDateTime.toISO({ suppressMilliseconds: true }),
      captureTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
    });
  }

  const record = getArchivedRecord(entry);
  if (record) {
    const recordSha256 = computeSha256(record.content);
    if (entry.sha256 && recordSha256 !== entry.sha256) {
      addValidationError(entry, "record-content-mismatch", {
        recordSha256,
        entrySha256: entry.sha256,
      });
    }
    if (record.status !== entry.statusCode) {
      addValidationError(entry, "record-status-mismatch", {
        recordStatus: record.status,
        entryStatus: entry.statusCode,
      });
    }
    if (record.timestamp !== entry.captureTimestamp.toISO({ suppressMilliseconds: true })) {
      addValidationError(entry, "record-timestamp-mismatch", {
        recordTimestamp: record.timestamp,
        entryTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      });
    }
    if (record.url !== entry.url) {
      addValidationError(entry, "record-url-mismatch", {
        recordUrl: record.url,
        entryUrl: entry.url,
      });
    }
  }
}
