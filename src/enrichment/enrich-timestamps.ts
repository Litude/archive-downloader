import { DateTime } from "luxon";
import { CaptureEntry } from "../types/capture-types.js";
import { getMostLikelyEtagDate, parseIisEtagDate } from "../utils/iis-etag-parser.js";
import { getHeaderValue } from "../headers/headers.js";

export function getExactModificationDate(
  captureEntry: CaptureEntry,
): { modificationTimePrecise?: string; plausiblePreciseModificationDates?: string[] } | null {
  const likelyIisServer = getHeaderValue(captureEntry.headerOutput, "server")
    ?.toLowerCase()
    .includes("microsoft-iis");
  try {
    const etagHeader = getHeaderValue(captureEntry.headerOutput, "etag");
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
          return { modificationTimePrecise: etagDates[0] };
        } else if (etagDates.length > 1) {
          if (etagDates[0].endsWith("0000000000Z")) {
            console.warn(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`,
            );
            return {
              modificationTimePrecise: etagDates[0],
              plausiblePreciseModificationDates: etagDates,
            };
          } else {
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
