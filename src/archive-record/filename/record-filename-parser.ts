import { DateTime } from "luxon";
import {
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./filename-parser-common.js";

export interface ParsedRecordFilename {
  crawlIdentifier: string;
  timestamp: string;
  serialNumber?: string;
  crawlerName?: string;
  recordFormat: "warc" | "arc";
}

export interface ParsedCommonCrawlFilename extends Partial<ParsedRecordFilename> {
  partition?: string;
  segment?: string;
  segmentTimestamp?: string;
}

function findTimestampPartIndex(
  parts: string[],
  {
    allow8Digits = false,
    allow14Digits = true,
    allow17Digits = false,
  }: { allow8Digits?: boolean; allow14Digits?: boolean; allow17Digits?: boolean },
): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (
      ((allow8Digits && /^\d{8}$/.test(parts[i])) ||
        (allow14Digits && /^\d{14}$/.test(parts[i])) ||
        (allow17Digits && /^\d{17}$/.test(parts[i]))) &&
      (parts[i].startsWith("20") || parts[i].startsWith("19"))
    ) {
      return i;
    }
  }
  return -1;
}

export function parseRecordFilename(filename: string): ParsedRecordFilename | undefined {
  const baseName = filename.split("/").pop() ?? filename;
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");

  const timestampPartIndex = findTimestampPartIndex(parts, {
    allow8Digits: false,
    allow14Digits: true,
    allow17Digits: true,
  });
  if (timestampPartIndex === -1 || timestampPartIndex < 1) {
    return undefined;
  }
  const timestamp = parts[timestampPartIndex];
  const crawlIdentifier = parts.slice(0, timestampPartIndex).join("-");
  const secondLastPart = parts.at(timestampPartIndex + 1);
  const lastPart = parts.slice(timestampPartIndex + 2).join("-");
  if (!secondLastPart || !timestamp || !crawlIdentifier) {
    return undefined;
  }
  let serialNumber: string | undefined = secondLastPart;
  let crawlerName: string | undefined = lastPart;
  // If the last part is missing, the second last part might be either the crawler name or the serial number.
  if (!lastPart) {
    if (/^\d+$/.test(secondLastPart)) {
      crawlerName = undefined;
    } else {
      serialNumber = undefined;
      crawlerName = secondLastPart;
    }
  }
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (!recordFormat) {
    return undefined;
  }
  return {
    crawlIdentifier,
    timestamp,
    serialNumber,
    crawlerName,
    recordFormat,
  };
}

export function parseCommonCrawlFilename(filename: string): ParsedCommonCrawlFilename | undefined {
  // New style filename for crawls in 2013 and later
  if (filename.startsWith("crawl-data/CC-MAIN-")) {
    const baseParts = parseRecordFilename(filename);
    if (!baseParts) {
      return undefined;
    }
    const { timestamp, serialNumber, crawlerName, recordFormat } = baseParts;
    const segmentMatch = filename.match(/crawl-data\/(.*?)\/segments\/(.*?)\//);
    if (!segmentMatch) {
      return undefined;
    }
    const [collection, segment] = segmentMatch.slice(1);
    const [segmentTimestamp, partition] = segment.split(".");
    return {
      crawlIdentifier: collection,
      timestamp,
      serialNumber,
      crawlerName,
      recordFormat,
      partition,
      segment: partition ? `${segmentTimestamp}.${partition}` : segmentTimestamp,
      segmentTimestamp: DateTime.fromMillis(+segmentTimestamp).toFormat("yyyyMMddHHmmssSSS"),
    };
  } else if (filename.startsWith("parse-output")) {
    // 2012 style filename
    const partsMatch = filename.match(/parse-output\/segment\/(\d+)\/(\d+)_(\d+)\.arc\.gz/);
    if (!partsMatch) {
      return undefined;
    }
    const [segmentTimestamp, timestamp, partition] = partsMatch.slice(1);
    return {
      crawlIdentifier: "CC-MAIN-2012",
      timestamp: DateTime.fromMillis(+timestamp).toFormat("yyyyMMddHHmmssSSS"),
      partition,
      recordFormat: "arc" as const,
      segment: segmentTimestamp,
      segmentTimestamp: DateTime.fromMillis(+segmentTimestamp).toFormat("yyyyMMddHHmmssSSS"),
    };
  } else if (filename.startsWith("crawl-001") || filename.startsWith("crawl-002")) {
    // Old style filename from 2008-2010
    const partsMatch = filename.match(
      /crawl-(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\/(\d+)_(\d+)\.arc\.gz/,
    );
    if (!partsMatch) {
      return undefined;
    }
    const [crawlNumber, year, month, day, hour, timestamp, partition] = partsMatch.slice(1);
    return {
      crawlIdentifier: crawlNumber === "001" ? "CC-MAIN-2008-2009" : "CC-MAIN-2009-2010",
      timestamp: DateTime.fromMillis(+timestamp).toFormat("yyyyMMddHHmmssSSS"),
      partition,
      recordFormat: "arc" as const,
      segment: `${year}/${month}/${day}/${hour}`,
    };
  }
}

export function extractTimestampFromFilename(filename: string): string | undefined {
  let cleaned = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  cleaned = cleaned.replaceAll(".", "-");
  cleaned = cleaned.replaceAll("_", "-");
  const parts = cleaned.split("-");
  const timestampPartIndex = findTimestampPartIndex(parts, {
    allow8Digits: true,
    allow14Digits: true,
    allow17Digits: true,
  });
  if (timestampPartIndex === -1) {
    return undefined;
  }
  return parts[timestampPartIndex];
}
