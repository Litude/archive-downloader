import { DateTime } from "luxon";
import { logWarning } from "./log-context.js";
import { CaptureEntry } from "../types/capture-types.js";
import { getMostLikelyEtagDate, parseIisEtagDate } from "./iis-etag-parser.js";
import { getCaptureHeaderValue } from "../headers/headers.js";

export function timestampMin(...timestamps: (string | undefined)[]): string | undefined {
  const validTimestamps = timestamps.filter(
    (ts): ts is string => ts !== undefined && ts.length > 0,
  );
  if (validTimestamps.length === 0) {
    return undefined;
  }
  return validTimestamps.reduce((min, ts) => (ts < min ? ts : min));
}

export function timestampMax(...timestamps: (string | undefined)[]): string | undefined {
  const validTimestamps = timestamps.filter(
    (ts): ts is string => ts !== undefined && ts.length > 0,
  );
  if (validTimestamps.length === 0) {
    return undefined;
  }
  return validTimestamps.reduce((max, ts) => (ts > max ? ts : max));
}

function sanityCheckTimestamps({
  url,
  lastModified,
  mementoDate,
  serverDate,
  captureDate,
}: {
  url: string;
  lastModified: DateTime<true> | null;
  mementoDate: DateTime<true> | null;
  serverDate: DateTime<true> | null;
  captureDate: DateTime<true>;
}) {
  if (lastModified && lastModified.diff(captureDate).as("hours") > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: last-modified ${lastModified.toISO()} is more than 1 hour newer than capture date ${captureDate.toISO()}`,
    );
  }
  if (mementoDate && Math.abs(mementoDate.diff(captureDate).as("hours")) > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: memento-datetime ${mementoDate.toISO()} is more than 1 hour different from capture date ${captureDate.toISO()}`,
    );
  } else if (mementoDate && !mementoDate?.equals(captureDate)) {
    logWarning(
      `Memento datetime ${mementoDate.toISO({ suppressMilliseconds: true })} does not match capture date ${captureDate.toISO({ suppressMilliseconds: true })} for ${url}`,
      "timestamp-sanity-check",
    );
    console.warn(
      `Warning: Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} memento-datetime ${mementoDate?.toISO()} is different from capture date ${captureDate.toISO()}`,
    );
  }
  if (serverDate && Math.abs(serverDate.diff(captureDate).as("months")) > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: server date ${serverDate.toISO()} is more than 1 month different from capture date ${captureDate.toISO()}`,
    );
  }
}

export function parseHeaderTimestamps(
  url: string,
  headers: Record<string, string>,
  captureTimestamp: string,
  validateTimestamps: boolean,
): {
  lastModified: DateTime<true> | null;
  mementoDate: DateTime<true> | null;
  serverDate: DateTime<true> | null;
  captureDate: DateTime<true>;
} {
  const parseDate = (val: string | undefined): DateTime | null => {
    if (!val) {
      return null;
    }
    const dt = DateTime.fromHTTP(val, { zone: "utc" });
    return dt.isValid ? dt : null;
  };
  let lastModified = parseDate(headers["x-archive-orig-last-modified"] || headers["last-modified"]);
  const serverDate = parseDate(headers["x-archive-orig-date"]);
  const mementoDate = parseDate(headers["memento-datetime"]);
  const captureDate = DateTime.fromFormat(captureTimestamp, "yyyyLLddHHmmss", { zone: "utc" });
  if (!captureDate.isValid) {
    throw new Error(`Invalid capture timestamp format: ${captureTimestamp}`);
  }
  // Sometimes, it seems servers might return last-modified which is the same as date, so it is not a true
  // last-modified. If last-modified is exactly the same as server date, treat it as missing.
  if (lastModified && serverDate && lastModified.toMillis() === serverDate.toMillis()) {
    lastModified = null;
  }
  if (validateTimestamps) {
    sanityCheckTimestamps({ url, lastModified, mementoDate, serverDate, captureDate });
  }
  return { lastModified, mementoDate, serverDate, captureDate };
}

export function getExactModificationDate(
  captureEntry: CaptureEntry,
): { modificationTimePrecise?: string; plausiblePreciseModificationDates?: string[] } | null {
  const likelyIisServer = getCaptureHeaderValue(captureEntry, "server")
    ?.toLowerCase()
    .includes("microsoft-iis");
  try {
    const etagHeader = getCaptureHeaderValue(captureEntry, "etag");
    if (etagHeader && captureEntry.lastModified) {
      const etagDates = getMostLikelyEtagDate(
        etagHeader,
        captureEntry.captureTimestamp,
        captureEntry.lastModified,
      );
      if (etagDates) {
        if (etagDates.length === 1) {
          return { modificationTimePrecise: etagDates[0] };
        } else if (etagDates.length > 1) {
          return { plausiblePreciseModificationDates: etagDates };
        }
      }
    } else if (etagHeader && likelyIisServer) {
      const etagDates = parseIisEtagDate(etagHeader, captureEntry.captureTimestamp);
      if (etagDates) {
        if (etagDates.length === 1) {
          logWarning(
            `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found 1 plausible match.`,
            "iis-etag-parser",
          );
          return { modificationTimePrecise: etagDates[0] };
        } else if (etagDates.length > 1) {
          if (etagDates[0].endsWith("0000000000Z")) {
            logWarning(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`,
              "iis-etag-parser",
            );
            console.warn(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`,
            );
            return {
              modificationTimePrecise: etagDates[0],
              plausiblePreciseModificationDates: etagDates,
            };
          } else {
            logWarning(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")} but unable to pick.`,
              "iis-etag-parser",
            );
            console.warn(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")}.`,
            );
            return { plausiblePreciseModificationDates: etagDates };
          }
        }
      }
    }
    return null;
  } catch (e) {
    if (likelyIisServer) {
      logWarning(
        `Parsing IIS ETag header for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })} failed.`,
        "iis-etag-parser",
      );
    }
    console.error(
      `Error parsing ETag for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO()}:`,
      e,
    );
    return null;
  }
}

export function getExactCaptureDate(captureEntry: CaptureEntry): string | null {
  if (captureEntry.metadata?.commoncrawl?.fetchTimestamp) {
    return DateTime.fromJSDate(new Date(captureEntry.metadata.commoncrawl.fetchTimestamp))
      .setZone("utc")
      .toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'000000Z'");
  }
  return null;
}

export function enrichCaptureEntryWithExactTimestamps(captureEntry: CaptureEntry) {
  const exactModificationDateInfo = getExactModificationDate(captureEntry);
  const exactCaptureDate = getExactCaptureDate(captureEntry);
  if (exactModificationDateInfo?.modificationTimePrecise) {
    captureEntry.lastModifiedPrecise = exactModificationDateInfo.modificationTimePrecise;
  }
  if (exactModificationDateInfo?.plausiblePreciseModificationDates) {
    captureEntry.lastModifiedPreciseCandidates =
      exactModificationDateInfo.plausiblePreciseModificationDates;
  }
  if (exactCaptureDate) {
    captureEntry.captureTimestampPrecise = exactCaptureDate;
  }
}
