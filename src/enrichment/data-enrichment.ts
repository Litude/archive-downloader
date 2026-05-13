import { CaptureEntry } from "../types/capture-types.js";
import { enrichCaptureEntryWithCrawlData } from "./enrich-crawldata.js";
import { enrichCaptureEntryWithExactTimestamps } from "./enrich-timestamps.js";
import { enrichWithRequestHeaders } from "./headers-enrichment.js";
import { enrichWithArchiveFileStats } from "./archive-file-stats-enrichment.js";

export async function enrichCaptureEntryData(captureEntry: CaptureEntry): Promise<void> {
  enrichCaptureEntryWithExactTimestamps(captureEntry);
  enrichCaptureEntryWithCrawlData(captureEntry);
  enrichWithRequestHeaders(captureEntry);
  await enrichWithArchiveFileStats(captureEntry);
}
