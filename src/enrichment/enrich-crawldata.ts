import { parseWarcinfoFile } from "../archive-record/warcinfo.js";
import { getHeaderValue } from "../headers/headers.js";
import { CaptureWarcInfoMetadata, CaptureEntry } from "../types/capture-types.js";

export function enrichCaptureEntryWithCrawlData(captureEntry: CaptureEntry) {
  const warcInfo = captureEntry.records
    ? captureEntry.records.find((record) => record.type === "warcinfo")
    : undefined;
  if (warcInfo) {
    const warcInfoMetadata = parseWarcinfoFile(warcInfo.content);
    const software = getHeaderValue(warcInfoMetadata.lines, "software");
    const isPartOf = getHeaderValue(warcInfoMetadata.lines, "ispartof");
    const description = getHeaderValue(warcInfoMetadata.lines, "description");
    const publisher = getHeaderValue(warcInfoMetadata.lines, "publisher");
    const operator = getHeaderValue(warcInfoMetadata.lines, "operator");
    if (software || isPartOf || description || publisher || operator) {
      const warcInfo: CaptureWarcInfoMetadata = {
        crawler: software,
        crawlJob: isPartOf,
        description,
        publisher,
        operator,
      };
      if (!captureEntry.metadata) {
        captureEntry.metadata = {};
      }
      if (!captureEntry.metadata.warcInfo) {
        captureEntry.metadata.warcInfo = warcInfo;
      }
    }
  }
}
