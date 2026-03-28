import { DateTime } from "luxon";
import { commonCrawlCleanupData } from "../downloader/commoncrawl/commoncrawl-cleanup.js";
import { CaptureEntry } from "../types/capture-types.js";

export interface DataCorrection {
  field: "captureTime" | "url";
  originalValue: string;
  correctedValue: string;
  reason: string;
}

function addCorrection(entry: CaptureEntry, correction: DataCorrection) {
  if (!entry.corrections) {
    entry.corrections = [];
  }
  entry.corrections.push(correction);
}

export function applyDataCorrectionsToEntry(entry: CaptureEntry) {
  const commonCrawlCollection = entry.metadata?.commoncrawl?.collection;
  if (commonCrawlCollection) {
    const collectionCleanupData = commonCrawlCleanupData[commonCrawlCollection.id];
    if (collectionCleanupData) {
      if (collectionCleanupData.timestampIsLocalTime) {
        const actualTimestamp = DateTime.fromFormat(entry.timestamp, "yyyyMMddHHmmss", {
          zone: "America/Los_Angeles",
        });
        if (actualTimestamp.isValid) {
          addCorrection(entry, {
            field: "captureTime",
            originalValue: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
            correctedValue: actualTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
            reason: `${commonCrawlCollection.id}: Capture time stored as local time`,
          });
          entry.timestamp = actualTimestamp.toUTC().toFormat("yyyyMMddHHmmss");
          entry.captureTimestamp = actualTimestamp.toUTC();
        } else {
          throw new Error(
            `Invalid timestamp format for entry ${entry.url} (${entry.timestamp}) in collection ${commonCrawlCollection.id}. Expected format: yyyyMMddHHmmss`,
          );
        }
      }
      if (collectionCleanupData.implicitRedirects) {
        // CommonCrawl collections with implicit redirects have a lot of captures where the URL is pre-redirect, but the content is from the post-redirect URL.
        // This is difficult to detect and fix, but we can at least handle cases where URLs that did not end with a slash were redirected to the same URL with a slash, which is a very common pattern.
        const requestUrlPathname = new URL(entry.cdxEntry.requestUrl).pathname.toLowerCase();
        const entryUrlPathname = new URL(entry.url).pathname.toLowerCase();
        if (
          !entryUrlPathname.endsWith("/") &&
          requestUrlPathname.endsWith("/") &&
          entryUrlPathname === requestUrlPathname.slice(0, -1) &&
          entry.statusCode === 200
        ) {
          const originalPathName = new URL(entry.url).pathname;
          const correctedUrl = entry.url.replace(originalPathName, originalPathName + "/");
          addCorrection(entry, {
            field: "url",
            originalValue: entry.url,
            correctedValue: correctedUrl,
            reason: `${commonCrawlCollection.id}: Redirects followed without updating URL`,
          });
          entry.url = correctedUrl;
        }
      }
    }
  }

  // Wayback has some very old entries with malformed URLs where the URL starts with "http://\" instead of "http://".
  if (entry.url.startsWith("http://\\")) {
    const correctedUrl = entry.url.slice(0, 7) + entry.url.slice(8);
    addCorrection(entry, {
      field: "url",
      originalValue: entry.url,
      correctedValue: correctedUrl,
      reason: `Malformed URL with backslash after protocol`,
    });
    entry.url = correctedUrl;
  }
}
