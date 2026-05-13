import { DateTime } from "luxon";
import {
  cleanUpRecordFilenameResult,
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";


function getCrawlerNameFromCrawlIdentifier(crawlIdentifier: string): string | undefined {
  switch (crawlIdentifier) {
    case "aug":
      return "crawler0";
    case "image":
      return "crawler1";
    default:
      return undefined;
  }
}

function parseCompaqSrcRegularCrawlFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // aug-000831010516.arc.gz
  // aug-000901000728.arc.gz
  // aug-001012135721.arc.gz
  // image-000828034411.arc.gz

  // Date range:
  // Minimum: 20000815052632 (from collection aug-000814222632-c)
  // Maximum: 20001012205721 (from aug-001012074629-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000814000000" &&
    captureTimestamp <= "20001013000000";

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const parts = baseName.split("-");
  if (parts.length !== 2) {
    return undefined;
  }

  const [crawlIdentifier, timestampPart] = parts;
  if (!crawlIdentifier || !timestampPart) {
    return undefined;
  }

  if (!["aug", "image"].includes(crawlIdentifier)) {
    return undefined;
  }

  const crawlerName = getCrawlerNameFromCrawlIdentifier(crawlIdentifier);

  if (timestampPart.length !== 12) {
    return undefined;
  }
  const fullTimestamp = `20${timestampPart}`;
  const parsedTimestamp = DateTime.fromFormat(fullTimestamp, "yyyyMMddHHmmss", {
    zone: "America/Los_Angeles",
  }).toUTC();
  if (!parsedTimestamp.isValid) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }

  return {
    confidence,
    filenameType: "compaqsrc-regular",
    recordFormat,
    details: {
      crawlIdentifier,
      crawlerName,
      fileWriteStartTimestamp: parsedTimestamp.toISO({ suppressMilliseconds: true }),
    },
  };
}

function parseCompaqSrcImageCrawlFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // IMG_XBB_000918163321.arc.gz

  // Date range:
  // Minimum: 20000727224017 (from IMG_AAA_SUBaj-965455412-c)
  // Maximum: 20001012140841 (from IMG_ABD_SUBai-971199393-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000701000000" &&
    captureTimestamp <= "20001015000000";

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const match = baseName.match(/^IMG_(X[A-Za-z]{2})_(\d{12})$/);
  if (!match) {
    return undefined;
  }
  const crawlGeneration = match[1];
  const crawlIdentifier = `IMG_${crawlGeneration}`;
  const timestampPart = match[2];
  const fullTimestamp = `20${timestampPart}`;
  const parsedTimestamp = DateTime.fromFormat(fullTimestamp, "yyyyMMddHHmmss", {
    zone: "America/Los_Angeles",
  }).toUTC();
  if (!parsedTimestamp.isValid || parsedTimestamp.year !== 2000) {
    return undefined;
  }
  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }

  return {
    confidence,
    filenameType: "compaqsrc-image",
    recordFormat,
    details: {
      crawlIdentifier,
      crawlGenerationCode: crawlGeneration,
      fileWriteStartTimestamp: parsedTimestamp.toISO({ suppressMilliseconds: true }),
    },
  };
}

function parseCompaqSrcElection2000CrawlFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // unique.20010415093936.arc.gz
  // unique.20010417041904.arc.gz
  // unique.20010508180458.arc.gz
  // unique.20010508180710.arc.gz
  // unique.20010618062323.arc.gz

  // Date range:
  // It seems that the timestamp in the filename is somekind of processing timestamp that is much later than the content itself
  // Acc to news the crawl happened from August 1, 2000 to January 14, 2001. But we make the check a bit more lenient since the timestamps
  // inside the files are not really known... Covers complete range from earliest known compaqsrc crawls to when final archive was processed
  // Minimum: 20000801000000 (from news about crawl)
  // Maximum: 20010215000000 (from news about crawl)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000701000000" &&
    captureTimestamp <= "20010701000000";

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const match = baseName.match(/^unique\.(\d{14})$/);
  if (!match) {
    return undefined;
  }
  const timestampPart = match[1];
  const parsedTimestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", { zone: "UTC" });
  if (!parsedTimestamp.isValid || parsedTimestamp.year != 2001) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "compaqsrc-election2000",
    recordFormat,
    details: {
      crawlIdentifier: "unique",
      crawlProcessingTimestamp: parsedTimestamp.toISO({ suppressMilliseconds: true }),
    },
  };
}

export function parseCompaqSrcRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [
    parseCompaqSrcRegularCrawlFilename,
    parseCompaqSrcImageCrawlFilename,
    parseCompaqSrcElection2000CrawlFilename,
  ];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const result = parser(filename, captureTimestamp);
    if (result) {
      results.push({ ...result, details: { ...result.details, crawlProvider: "compaqsrc" } });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results.map(cleanUpRecordFilenameResult);
}
