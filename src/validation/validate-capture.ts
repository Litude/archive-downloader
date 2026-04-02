import { DateTime } from "luxon";
import { getArchivedRecord } from "../archive-record/archive-record.js";
import { CaptureEntry } from "../types/capture-types.js";
import { computeSha256 } from "../utils/hash.js";

export interface ValidationError {
  type: string;
  values?: {
    field: string;
    value: unknown;
  }[];
}

export function addValidationError(
  entry: CaptureEntry,
  error: string,
  values?: ValidationError["values"],
) {
  if (!entry.metadata) {
    entry.metadata = {};
  }
  if (!entry.metadata.validationErrors) {
    entry.metadata.validationErrors = [];
  }
  entry.metadata.validationErrors.push({ type: error, values });
}

export function validateCaptureEntries(entries: CaptureEntry[]) {
  for (const entry of entries) {
    validateCaptureEntry(entry);
  }
}

export function validateCaptureEntry(entry: CaptureEntry) {
  if (entry.headerOutput?.find(([k]) => k.toLowerCase() === "date")) {
    const serverDateHeader = entry.headerOutput.find(([k]) => k.toLowerCase() === "date")?.[1];
    const serverDate = serverDateHeader
      ? DateTime.fromHTTP(serverDateHeader, { zone: "utc" })
      : null;
    if (serverDate?.isValid && Math.abs(serverDate.diff(entry.captureTimestamp).as("months")) > 1) {
      addValidationError(entry, "server-time-mismatch", [
        { field: "serverTime", value: serverDate.toISO({ suppressMilliseconds: true }) },
        {
          field: "captureTime",
          value: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
        },
      ]);
    }
  }

  if (entry.captureTimestampPrecise) {
    const preciseCaptureTimestamp = DateTime.fromISO(entry.captureTimestampPrecise, {
      zone: "utc",
    });
    if (preciseCaptureTimestamp.isValid) {
      if (Math.abs(preciseCaptureTimestamp.diff(entry.captureTimestamp).as("seconds")) > 1) {
        addValidationError(entry, "capture-time-precise-mismatch", [
          { field: "captureTimePrecise", value: entry.captureTimestampPrecise },
          {
            field: "captureTime",
            value: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
          },
        ]);
      }
    }
  }

  if (entry.lastModified && entry.lastModified.diff(entry.captureTimestamp).as("hours") > 1) {
    addValidationError(entry, "modification-time-future", [
      {
        field: "modificationTime",
        value: entry.lastModified.toISO({ suppressMilliseconds: true }),
      },
      { field: "captureTime", value: entry.captureTimestamp.toISO({ suppressMilliseconds: true }) },
    ]);
  }

  if (entry.lastModifiedPrecise && entry.lastModified) {
    const preciseLastModified = DateTime.fromISO(entry.lastModifiedPrecise, { zone: "utc" });
    if (preciseLastModified.isValid) {
      if (Math.abs(preciseLastModified.diff(entry.lastModified).as("seconds")) > 1) {
        addValidationError(entry, "modification-time-precise-mismatch", [
          { field: "modificationTimePrecise", value: entry.lastModifiedPrecise },
          {
            field: "modificationTime",
            value: entry.lastModified.toISO({ suppressMilliseconds: true }),
          },
        ]);
      }
    }
  }

  if (entry.lastModifiedPreciseCandidates?.length && entry.lastModified) {
    const candidateDates = entry.lastModifiedPreciseCandidates.map((d) =>
      DateTime.fromISO(d, { zone: "utc" }),
    );
    if (candidateDates) {
      candidateDates.forEach((candidate, index) => {
        if (candidate.isValid && Math.abs(candidate.diff(entry.lastModified!).as("seconds")) > 1) {
          addValidationError(entry, "modification-time-precise-candidate-mismatch", [
            {
              field: "modificationTimePreciseCandidate",
              value: entry.lastModifiedPreciseCandidates?.[index],
            },
            {
              field: "modificationTime",
              value: entry.lastModified?.toISO({ suppressMilliseconds: true }),
            },
          ]);
        }
      });
    }
  }

  if (
    entry.mementoDateTime &&
    entry.mementoDateTime.toMillis() !== entry.captureTimestamp.toMillis()
  ) {
    addValidationError(entry, "memento-time-mismatch", [
      { field: "mementoTime", value: entry.mementoDateTime.toISO({ suppressMilliseconds: true }) },
      { field: "captureTime", value: entry.captureTimestamp.toISO({ suppressMilliseconds: true }) },
    ]);
  }

  // This validation is meant to validate that the ARC/WARC matches what the CDX record indicated,
  // so we disregard any corrections to capture time or url for this validation
  const record = getArchivedRecord(entry);
  if (record) {
    // We can't validate the content for revisit records since they don't contain the full content,
    // and the status could be e.g. 304 instead of 200, so we skip these checks when there is a revisit entry
    if (!entry.cdxEntry?.revisitEntry) {
      const recordSha256 = computeSha256(record.content);
      if (entry.sha256 && recordSha256 !== entry.sha256) {
        addValidationError(entry, "record-content-mismatch", [
          { field: "recordSha256", value: recordSha256 },
          { field: "entrySha256", value: entry.sha256 },
        ]);
      }
      if (record.status !== entry.statusCode) {
        addValidationError(entry, "record-status-mismatch", [
          { field: "recordStatus", value: record.status },
          { field: "entryStatus", value: entry.statusCode },
        ]);
      }
    }

    const cdxTimestamp = DateTime.fromFormat(entry.cdxEntry.timestamp, "yyyyLLddHHmmss", {
      zone: "utc",
    }).toISO({ suppressMilliseconds: true });
    if (record.timestamp !== cdxTimestamp) {
      addValidationError(entry, "record-timestamp-mismatch", [
        { field: "recordTimestamp", value: record.timestamp },
        { field: "entryTimestamp", value: cdxTimestamp },
      ]);
    }

    if (record.url !== entry.cdxEntry.url) {
      addValidationError(entry, "record-url-mismatch", [
        { field: "recordUrl", value: record.url },
        { field: "entryUrl", value: entry.cdxEntry.url },
      ]);
    }
  }
}
