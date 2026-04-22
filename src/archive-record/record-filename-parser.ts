import { DateTime } from "luxon";

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

function removeFileExtensionFromPart(part: string): string {
  let fixed = part;
  if (fixed.toLowerCase().endsWith(".gz")) {
    fixed = fixed.slice(0, -3);
  }
  if (fixed.toLowerCase().endsWith(".zst")) {
    fixed = fixed.slice(0, -4);
  }
  if (fixed.toLowerCase().endsWith(".arc")) {
    fixed = fixed.slice(0, -4);
  }
  if (fixed.toLowerCase().endsWith(".warc")) {
    fixed = fixed.slice(0, -5);
  }
  return fixed;
}

export function parseRecordFilename(filename: string): ParsedRecordFilename | undefined {
  const baseName = filename.split("/").pop() ?? filename;
  const parts = removeFileExtensionFromPart(baseName).split("-");

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
  const recordFormat = parseRecordFormat(filename);
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

export function parseRecordFormat(filename: string): "warc" | "arc" {
  let normalized = filename.toLowerCase();
  if (normalized.endsWith(".gz")) {
    normalized = normalized.slice(0, -3);
  }
  if (normalized.endsWith(".zst")) {
    normalized = normalized.slice(0, -4);
  }
  if (normalized.endsWith(".warc")) {
    return "warc";
  } else if (normalized.endsWith(".arc")) {
    return "arc";
  } else {
    throw new Error(`Unknown record format for filename: ${filename}`);
  }
}

function getCrawlerNameFromAbbreviation(abbreviation: string): string | undefined {
  switch (abbreviation) {
    case "GR":
      return "green";
    case "FS":
      return "firestone";
    case "ST":
      return "sterling";
    case "IA": // Generic IA crawler which is known to actually only have been widener (still plausible that it could also have been some other crawler, but we have no evidence for that)
      return "widener";
    case "BK": // Brewster Kahle's test crawler(???)
    case "TS": // Test(???)
    case "F2": // Only two arcs, probably some test again (e.g. firestone v2 test?)
    default:
      return undefined;
  }
}

export function parseAlexaRecordFilename(filename: string, timestamp: string) {
  const baseName = removeFileExtensionFromPart(filename.split("/").pop() ?? filename);

  if (timestamp < "19980709") {
    // Matches names such as:
    // GR-034747.arc.gz
    // FS-195519.arc.gz
    // IA-000150X.arc.gz
    const oldNameMatch = baseName.match(/^([A-Z]{2})-(\d{6}[A-Z])$/);
    if (oldNameMatch) {
      const crawlIdentifier = oldNameMatch[1];
      const serialNumber = oldNameMatch[2];
      const crawlerName = getCrawlerNameFromAbbreviation(crawlIdentifier);
      return {
        crawlIdentifier,
        timestamp,
        serialNumber,
        crawlerName,
        recordFormat: "arc" as const,
      };
    }
  }
  if (timestamp < "19981208") {
    // Matches names such as:
    // green-0127-912881100.arc.gz
    const parts = baseName.split("-");
    if (parts.length === 3) {
      const crawlerName = parts[0];
      const serialNumber = parts[1];
      const timestamp = DateTime.fromSeconds(+parts[2]).toISO({ suppressMilliseconds: true });
      return {
        crawlIdentifier: crawlerName,
        timestamp,
        serialNumber,
        crawlerName,
        recordFormat: "arc" as const,
      };
    }
  }

  // Try to parse names such as:
  // DG_crawl5.20010820185613.arc.gz
  // EF_dad_9_0_crawl28_.20051102083259.arc.gz
  if (
    [...baseName].filter((c) => c === ".").length === 1 &&
    findTimestampPartIndex(baseName.split("."), { allow14Digits: true }) === 1
  ) {
    const [crawlIdentifier, timestamp] = baseName.split(".");
    if (crawlIdentifier && timestamp) {
      return { timestamp, crawlIdentifier };
    }
  }

  // Try to parse names such as:
  // green-0157-19990218235953-919580111.arc.gz
  const parts = baseName.split("-");
  if (parts.length === 4) {
    const timestampPartIndex = findTimestampPartIndex(parts, { allow14Digits: true });
    if (timestampPartIndex === 2) {
      const crawlStartTime = DateTime.fromSeconds(+parts[3]);
      // TODO: Should we pass the capture date as parameter to allow more flexible validation of the timestamp part
      if (crawlStartTime.isValid && crawlStartTime.year >= 1990 && crawlStartTime.year <= 2030) {
        return {
          timestamp: crawlStartTime.toFormat("yyyyMMddHHmmss"),
          batchTimestamp: parts[2],
          crawlIdentifier: `${parts[0]}-${parts[1]}`,
        };
      }
    }
  }
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
  let cleaned = removeFileExtensionFromPart(filename.split("/").pop() ?? filename);
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
