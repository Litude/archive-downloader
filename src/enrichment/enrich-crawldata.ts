import { parseArcHeader } from "../archive-record/arc-header.js";
import { parseWarcinfoFile } from "../archive-record/warc-info.js";
import { getHeaderValue } from "../headers/headers.js";
import { CrawlInfoMetadata, CaptureEntry } from "../types/capture-types.js";

export function enrichCaptureEntryWithCrawlData(captureEntry: CaptureEntry) {
  const warcInfo = captureEntry.records
    ? captureEntry.records.find((record) => record.type === "warc-info")
    : undefined;
  const arcHeader = captureEntry.records
    ? captureEntry.records.find((record) => record.type === "arc-header")
    : undefined;
  if (warcInfo) {
    const warcInfoMetadata = parseWarcinfoFile(warcInfo.content);
    const software = getHeaderValue(warcInfoMetadata.lines, "software");
    const ip = getHeaderValue(warcInfoMetadata.lines, "ip");
    const hostname = getHeaderValue(warcInfoMetadata.lines, "hostname");
    const isPartOf = getHeaderValue(warcInfoMetadata.lines, "isPartOf");
    const description = getHeaderValue(warcInfoMetadata.lines, "description");
    const publisher = getHeaderValue(warcInfoMetadata.lines, "publisher");
    const operator = getHeaderValue(warcInfoMetadata.lines, "operator");
    const format = getHeaderValue(warcInfoMetadata.lines, "format");
    const robots = getHeaderValue(warcInfoMetadata.lines, "robots");
    const conformsTo = getHeaderValue(warcInfoMetadata.lines, "conformsTo");

    const crawlInfo: CrawlInfoMetadata = {
      crawler: software,
      ip,
      hostname,
      crawlJob: isPartOf,
      description,
      publisher,
      operator,
      robots,
      format,
      conformsTo,
    };
    if (Object.values(crawlInfo).some((v) => v !== undefined)) {
      if (!captureEntry.metadata) {
        captureEntry.metadata = {};
      }
      if (!captureEntry.metadata.crawlInfo) {
        captureEntry.metadata.crawlInfo = crawlInfo;
      }
    }
  } else if (arcHeader) {
    const result = parseArcHeader(arcHeader.content);
    if (result.length) {
      const software = getHeaderValue(result, "software");
      const hostname = getHeaderValue(result, "hostname");
      const ip = getHeaderValue(result, "ip");
      const isPartOf = getHeaderValue(result, "isPartOf");
      const description = getHeaderValue(result, "description");
      const operator = getHeaderValue(result, "operator");
      const robots = getHeaderValue(result, "robots");
      const format = getHeaderValue(result, "format");
      const conformsTo = getHeaderValue(result, "conformsTo");

      const crawlInfo: CrawlInfoMetadata = {
        crawler: software,
        ip,
        hostname,
        crawlJob: isPartOf,
        description,
        operator,
        robots,
        format,
        conformsTo,
      };
      if (Object.values(crawlInfo).some((v) => v !== undefined)) {
        if (!captureEntry.metadata) {
          captureEntry.metadata = {};
        }
        if (!captureEntry.metadata.crawlInfo) {
          captureEntry.metadata.crawlInfo = crawlInfo;
        }
      }
    }
  }
}
