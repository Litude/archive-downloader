import { DateTime } from "luxon";

export interface ParsedRecordFilenameResult {
  confidence: number;
  filenameType: string;
  recordFormat: "warc" | "arc";
  details: ParsedRecordFilename;
}

export interface ParsedRecordFilename {
  /** Crawl identification */
  crawlIdentifier: string;
  crawlOriginalIdentifier?: string; // if the crawl is actually an import of a previous crawl or the identifier was later changed for some reason, this can be used to store the original identifier
  crawlProvider?: string; // e.g. "alexa", "commoncrawl", "dec", "internetarchive"
  crawlCollectionId?: string; // archive-it collection, or common crawl collection (for most ia collections the collection name is not very informative and is actually confusing...)
  crawlGenerationCode?: string; // for AA type alexa crawls, e.g. DX, EL, EI
  crawlSequence?: number; // number of alexa crawl that increments also with generation
  crawlRun?: number; // rerun of previous crawl(?)
  crawlJobId?: string;
  crawlSeedId?: string;
  crawlToken?: string;

  /** Crawl parameters */
  crawlInterval?: string; // how often crawl was executed, e.g. "1h", "3h", "6h", "12h", "24h", "1w"
  crawlDepth?: string; // how deep crawl went, e.g. "1", "2", "3", "4", "5", "unlimited"
  crawlTuningParameter?: number;
  crawlSubset?: string; // if the crawl focused on some particular type of content
  crawlFlags?: string[]; // e.g. "aborted", "compressed", "deduped", "filtered", "processed", "unprocessed"

  /** Crawler information */
  crawlerName?: string;
  crawlerPid?: string;
  crawlerNode?: string;
    
  /** Timing (chronological order) */
  crawlStartDate?: string; // date when crawl was executed, in format YYYY-MM-DD, e.g. 2020-05-20
  crawlYear?: string; // year when crawl was executed, e.g. 2020
  crawlBatchStartTimestamp?: string; // should be before fileWriteStartTimestamp (or certainly not later), when batch started
  fileWriteStartTimestamp?: string; // when ARC/WARC writing started
  fileWriteEndTimestamp?: string; // when ARC/WARC writing ended, should be after fileWriteStartTimestamp
  crawlProcessingTimestamp?: string; // when crawl was processed (perhaps converted to ARC/WARC) and made available, should be after other timestamps

  /** File other information */
  fileSerialNumber?: string;
  filePartition?: string;
  fileSegment?: string;
  fileSegmentTimestamp?: string;
}

const crawlOrdering: Record<keyof ParsedRecordFilename, number> = {
  crawlIdentifier: 1,
  crawlOriginalIdentifier: 2,
  crawlProvider: 3,
  crawlCollectionId: 4,
  crawlGenerationCode: 5,
  crawlSequence: 6,
  crawlRun: 7,
  crawlJobId: 8,
  crawlSeedId: 9,
  crawlToken: 10,

  crawlInterval: 11,
  crawlDepth: 12,
  crawlTuningParameter: 13,
  crawlSubset: 14,
  crawlFlags: 15,

  crawlerName: 16,
  crawlerPid: 17,
  crawlerNode: 18,

  crawlStartDate: 19,
  crawlYear: 20,
  crawlBatchStartTimestamp: 21,
  fileWriteStartTimestamp: 22,
  fileWriteEndTimestamp: 23,
  crawlProcessingTimestamp: 24,

  fileSerialNumber: 25,
  filePartition: 26,
  fileSegment: 27,
  fileSegmentTimestamp: 28,
};

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
  crawlerName: string;
  crawlerPid: string | undefined;
} {
  // Format might be {pid}~{hostname}~{port}, e.g. 06655~wbgrp-crawl302.us.archive.org~8443
  // Or it might be {hostname}-{port}
  const parts = crawlerName.split("~");
  if (parts.length === 3) {
    return {
      crawlerPid: parts[0],
      crawlerName: `${parts[1]}:${parts[2]}`,
    };
  } else if (crawlerName.match(/-\d+$/)) {
    const lastDashIndex = crawlerName.lastIndexOf("-");
    const port = crawlerName.slice(lastDashIndex + 1);
    const hostname = crawlerName.slice(0, lastDashIndex);
    return {
      crawlerPid: undefined,
      crawlerName: `${hostname}:${port}`,
    };
  } else {
    return { crawlerName, crawlerPid: undefined };
  }
}

export function cleanUpRecordFilenameResult(result: ParsedRecordFilenameResult): ParsedRecordFilenameResult {
  const cleanedDetails: Partial<ParsedRecordFilename> = {};
  for (const key of Object.keys(result.details) as (keyof ParsedRecordFilename)[]) {
    if (result.details[key] !== undefined) {
      (cleanedDetails as Record<string, unknown>)[key] = result.details[key];
    }
  }
  // Sort details by crawlOrdering
  const sortedDetails = Object.fromEntries(
    Object.entries(cleanedDetails).sort(
      (a, b) => (crawlOrdering[a[0] as keyof ParsedRecordFilename] ?? 999) - (crawlOrdering[b[0] as keyof ParsedRecordFilename] ?? 999),
    ),
  ) as unknown as ParsedRecordFilename;
  return {
    confidence: result.confidence,
    filenameType: result.filenameType,
    recordFormat: result.recordFormat,
    details: sortedDetails,
  };
}
