import path from "path";
import fs from "fs";
import {
  CaptureCommonCrawlMetadata,
  CaptureEntry,
  CaptureWaybackMetadata,
  Classification,
} from "../types/capture-types.js";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { CdxEntry } from "../types/wayback-types.js";
import { RawHeader } from "../headers/raw-header-parser.js";
import { DataCorrection } from "../data-corrections/data-correction.js";

/** CdxEntry as written to capture JSON files — optional fields are serialized as null rather than omitted */
export interface CdxEntryJson {
  urlkey: string;
  timestamp: string;
  url: string;
  status?: number;
  digest: string | null;
  mimetype: string;
  filename: string | null;
  offset: number | null;
  length: number | null;
}

export interface CaptureDataJson {
  url: string;
  /** ISO 8601 datetime with seconds precision, e.g. "1999-04-22T15:37:00Z" */
  captureTime: string;
  /** ISO 8601 datetime with nanosecond precision, only available for early Common Crawl captures */
  captureTimePrecise?: string;
  mementoTime?: string;
  hostIp?: string;
  protocol?: string;
  status?: number;
  mimeType: string;
  contentSize?: number;
  contentSha256?: string;
  contentDigest?: string;
  /** ISO 8601 datetime from Last-Modified header */
  modificationTime?: string;
  /** ISO 8601 datetime with nanosecond precision derived from IIS ETag */
  modificationTimePrecise?: string;
  /** Multiple candidate modification times when ETag parsing is ambiguous */
  modificationTimePreciseCandidates?: string[];
  headers?: RawHeader[];
  classification: Classification;
  corrections?: DataCorrection[];
  validationErrors?: {
    type: string;
    details?: unknown;
  }[];
  captureData: {
    source: string;
    archiveRecordFormat?: "warc" | "arc";
    archiveRecordAvailable: boolean;
    cdxEntry: CdxEntryJson;
    cdxEntryRevisitResolved?: CdxEntryJson;
    additionalSources?: {
      source: string;
      cdxEntry: CdxEntryJson;
    }[];
    crawlData?: {
      crawler?: string;
      crawljob?: string;
      description?: string;
      publisher?: string;
      operator?: string;
    };
    wayback?: CaptureWaybackMetadata;
    commoncrawl?: CaptureCommonCrawlMetadata;
  };
}

function cdxToOutputData(entry: CdxEntry): CdxEntryJson {
  return {
    urlkey: entry.urlkey,
    timestamp: entry.timestamp,
    url: entry.url,
    status: entry.status,
    digest: entry.digest ?? null,
    mimetype: entry.mimetype,
    filename: entry.filename ?? null,
    offset: entry.offset ?? null,
    length: entry.length ?? null,
  };
}

/** Use for custom formatting of e.g. header tuples */
function stringifyWithInlineTuples(data: unknown, inlineElementsOf: Set<unknown[]>): string {
  const placeholders = new Map<string, string>();
  let counter = 0;

  function process(val: unknown): unknown {
    if (Array.isArray(val)) {
      if (inlineElementsOf.has(val)) {
        return val.map((item) => {
          const key = `__HDR_TUPLE_${counter++}__`;
          const string = `[${item.map((value: any) => JSON.stringify(value)).join(", ")}]`;
          placeholders.set(key, string);
          return key;
        });
      }
      return val.map(process);
    }
    if (val !== null && typeof val === "object") {
      return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, process(v)]));
    }
    return val;
  }

  let json = JSON.stringify(process(data), null, 2);
  for (const [key, compact] of placeholders) {
    json = json.replace(`"${key}"`, compact);
  }
  return json;
}

export function writeCaptureData(
  captureEntries: CaptureEntry[],
  filename: Filename,
  outputDirectory: string,
) {
  const headerFilename = structuredClone(filename);
  const archivalDir = path.join(outputDirectory, ".archivaldata");
  fs.mkdirSync(archivalDir, { recursive: true });

  captureEntries.forEach((entry) => {
    const entryFilename = structuredClone(headerFilename);
    if (entry.classification.type !== "ok") {
      entryFilename.flags = "invalid";
    }
    entryFilename.timestamp = entry.captureTimestamp.toFormat("yyyyLLddHHmmss");
    // 0 capture index is intentionally skipped
    const outputFilename = filenameToString(
      entryFilename,
      "full",
      entry.captureIndex ? entry.captureIndex : undefined,
    );

    const mainCdxEntry = entry.cdxEntry.revisitEntry ?? entry.cdxEntry;
    const resolvedRevisitCdxEntry = entry.cdxEntry.revisitEntry ? entry.cdxEntry : undefined;

    const headersResult = entry.headerOutput;

    const inlineElementsOf = new Set<unknown[]>();
    if (headersResult) {
      inlineElementsOf.add(headersResult);
    }

    const archiveRecordAvailable = Boolean(
      entry.records?.find((r) => ["warc", "arc"].includes(r.type))?.type ?? undefined,
    );
    const archiveFilename = mainCdxEntry.filename;
    const nonZippedFilename = archiveFilename?.endsWith(".gz")
      ? archiveFilename.slice(0, -3)
      : archiveFilename?.endsWith(".zst")
        ? archiveFilename.slice(0, -4)
        : archiveFilename;
    const archiveRecordFormat = nonZippedFilename?.endsWith(".warc")
      ? "warc"
      : nonZippedFilename?.endsWith(".arc")
        ? "arc"
        : undefined;

    const captureDataPath = path.join(archivalDir, `${outputFilename}.capture.json`);
    const captureData: CaptureDataJson = {
      url: entry.url,
      captureTime: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      captureTimePrecise: entry.captureTimestampPrecise ?? undefined,
      mementoTime: entry.mementoDateTime
        ? entry.mementoDateTime.toISO({ suppressMilliseconds: true })
        : undefined,
      hostIp: entry.hostIp,
      protocol: entry.protocol,
      status: entry.statusCode,
      mimeType: entry.mimetype,
      contentSize: entry.content?.length,
      contentSha256: entry.originalSha256 ?? entry.sha256,
      contentDigest: entry.actualDigest,
      modificationTime: entry.lastModified
        ? entry.lastModified.toISO({ suppressMilliseconds: true })
        : undefined,
      modificationTimePrecise: entry.lastModifiedPrecise ?? undefined,
      modificationTimePreciseCandidates: entry.lastModifiedPreciseCandidates ?? undefined,
      headers: headersResult,
      classification: entry.classification,
      corrections: entry.corrections,
      validationErrors: entry.metadata?.validationErrors,
      captureData: {
        source: entry.cdxEntry.source,
        archiveRecordFormat,
        archiveRecordAvailable,
        cdxEntry: cdxToOutputData(mainCdxEntry),
        cdxEntryRevisitResolved: resolvedRevisitCdxEntry
          ? cdxToOutputData(resolvedRevisitCdxEntry)
          : undefined,
        additionalSources: entry.additionalSources?.map((source) => ({
          source: source.source,
          cdxEntry: cdxToOutputData(source.cdxEntry),
        })),
        crawlData: entry.metadata?.crawlData,
        wayback: entry.metadata?.wayback,
        commoncrawl: entry.metadata?.commoncrawl,
      },
    };
    fs.writeFileSync(captureDataPath, stringifyWithInlineTuples(captureData, inlineElementsOf));
    const mtime = new Date(entry.captureTimestamp.toJSDate());
    fs.utimesSync(captureDataPath, mtime, mtime);

    if (entry.records) {
      for (const record of entry.records) {
        const recordPath = path.join(
          archivalDir,
          record.type === "warcinfo"
            ? `${outputFilename}.warcinfo.warc`
            : `${outputFilename}.record.${record.type}`,
        );
        fs.writeFileSync(recordPath, record.content);
        fs.utimesSync(recordPath, mtime, mtime);
      }
    }
  });
}
