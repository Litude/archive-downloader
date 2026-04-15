import { CaptureEntry } from "../types/capture-types.js";
import { deriveHeaders } from "./derive-headers.js";
import { enrichCaptureEntryWithCrawlData } from "./enrich-crawldata.js";
import { enrichCaptureEntryWithExactTimestamps } from "./enrich-timestamps.js";

export function enrichCaptureEntryData(captureEntry: CaptureEntry) {
  enrichCaptureEntryWithExactTimestamps(captureEntry);
  enrichCaptureEntryWithCrawlData(captureEntry);
  deriveHeaders(captureEntry);
}
