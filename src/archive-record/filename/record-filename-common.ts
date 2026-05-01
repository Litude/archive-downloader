import { DateTime } from "luxon";

export interface ParsedRecordFilenameResult {
  confidence: number;
  filenameType: string;
  recordFormat: "warc" | "arc";
  details: ParsedRecordFilename;
}

export interface ParsedRecordFilename {
  crawlIdentifier: string;
  originalCrawlIdentifier?: string; // for cases where crawlIdentifier is normalized or simplified, e.g. by removing generation or sequence information
  crawlGeneration?: string; // for AA type alexa crawls, e.g. DX, EL, EI
  crawlSequence?: string; // number of alexa crawl that increments also with generation
  crawlRun?: string; // return of previous crawl(?)
  serialNumber?: string;
  crawlInfrastructure?: string; // e.g. "alexa", "commoncrawl", "dec", "internetarchive"
  startTimestamp?: string; // when ARC/WARC writing started
  endTimestamp?: string; // when ARC/WARC writing ended, should be after startTimestamp
  batchTimestamp?: string; // should be before startTimestamp (or certainly not later), when batch started
  processedTimestamp?: string; // when crawl was processed (perhaps converted to ARC/WARC) and made available, should be after other timestamps
  crawlerName?: string;
  crawlerPid?: string;
  node?: string;
  partition?: string;
  crawlPeriod?: string; // how often crawl was executed, e.g. "1h", "3h", "6h", "12h", "24h", "1w"
  crawlDepth?: string; // how deep crawl went, e.g. "1", "2", "3", "4", "5", "unlimited"
  segment?: string;
  segmentTimestamp?: string;
  tuningParameter?: number;
  subset?: string; // if the crawl focused on some particular type of content
  jobId?: string;
  seedId?: string;
  crawlToken?: string;
  collectionId?: string;
  flags?: string[]; // e.g. "aborted", "compressed", "deduped", "filtered", "processed", "unprocessed"
}

export function removeFileExtensionFromArchiveFilename(part: string): string {
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

export function parseRecordFormatFromArchiveFilename(filename: string): "warc" | "arc" {
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

export function parseEpochSecondsFromArchiveFilename(part: string): DateTime<true> | undefined {
  // epoch seconds should never be zero padded, so if it starts with a zero, it is most likely not epoch seconds
  if (part.startsWith("0")) {
    return undefined;
  }
  const date = DateTime.fromSeconds(parseInt(part));
  if (date.isValid) {
    return date;
  }
  return undefined;
}

export function findRecordNameTimestampPartIndex(
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

export function parseRecordNameTimestamp(timestamp: string): string | undefined {
  if (timestamp.length === 14) {
    return (
      DateTime.fromFormat(timestamp, "yyyyMMddHHmmss", { zone: "UTC" }).toISO({
        suppressMilliseconds: true,
      }) ?? undefined
    );
  }
  if (timestamp.length === 17) {
    return (
      DateTime.fromFormat(timestamp, "yyyyMMddHHmmssSSS", { zone: "UTC" }).toISO() ?? undefined
    );
  }
  return undefined;
}

export function cleanUpRecordFilenameCrawlerName(crawlerName: string): {
  crawlerName: string; crawlerPid: string | undefined;
} {
  // Format might be {pid}~{hostname}~{port}, e.g. 06655~wbgrp-crawl302.us.archive.org~8443
  // Or it might be {hostname}-{port}
  const parts = crawlerName.split("~");
  if (parts.length === 3) {
    return {
      crawlerPid: parts[0],
      crawlerName: `${parts[1]}:${parts[2]}`,
    };
  }
  else if (crawlerName.match(/-\d+$/)) {
    const lastDashIndex = crawlerName.lastIndexOf("-");
    const port = crawlerName.slice(lastDashIndex + 1);
    const hostname = crawlerName.slice(0, lastDashIndex);
    return {
      crawlerPid: undefined,
      crawlerName: `${hostname}:${port}`,
    };
  }
  else {
    return { crawlerName, crawlerPid: undefined };
  }
}
