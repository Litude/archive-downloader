import path from "path";
import fs from "fs";
import {
  CaptureCommonCrawlMetadata,
  CaptureEntry,
  CrawlInfoMetadata,
  CaptureWaybackMetadata,
  Classification,
} from "../types/capture-types.js";
import { ArchiveFileInfo } from "../enrichment/crawlers-enrichment.js";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { CdxEntry } from "../types/wayback-types.js";
import { RawHeader } from "../headers/raw-header-parser.js";
import { DataCorrection } from "../data-corrections/data-correction.js";
import { getContentLengthHeader, getHeaderValue } from "../headers/headers.js";
import { ValidationError } from "../validation/validate-capture.js";
import { parseWarcFile } from "../archive-record/warc.js";
import { parseRecordFormatFromArchiveFilename } from "../archive-record/filename/record-filename-common.js";

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
  request: {
    protocol?: string;
    method: string;
    headers?: RawHeader[];
    headersDerived?: true;
  };
  response: {
    protocol?: string;
    statusCode?: number;
    statusText?: string;
    headers?: RawHeader[];
    headersDerived?: true;
    body: {
      contentSize?: number;
      compressedSize?: number;
      contentEncoding?: string;
      mimeType: string;
      sha256?: string;
      digest?: string;
    };
  };
  /** ISO 8601 datetime from Last-Modified header */
  modificationTime?: string;
  /** ISO 8601 datetime with nanosecond precision derived from IIS ETag */
  modificationTimePrecise?: string;
  /** Multiple candidate modification times when ETag parsing is ambiguous */
  modificationTimePreciseCandidates?: string[];
  classification: Classification;
  corrections?: DataCorrection[];
  validationErrors?: ValidationError[];
  source: {
    provider: string;
    recordFormat?: "warc" | "arc";
    recordAvailable: boolean;
    cdxEntry: CdxEntryJson;
    cdxEntryRevisitResolved?: CdxEntryJson;
    additionalSources?: {
      provider: string;
      cdxEntry: CdxEntryJson;
    }[];
    crawlInfo?: CrawlInfoMetadata;
    wayback?: CaptureWaybackMetadata;
    commonCrawl?: CaptureCommonCrawlMetadata;
    archiveFileInfo?: ArchiveFileInfo;
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

function getRequestHeaders(
  captureEntry: CaptureEntry,
): { headers: RawHeader[]; partial?: boolean } | undefined {
  const warcRequestRecord = captureEntry.records?.find((r) => r.type === "warc-request");
  if (warcRequestRecord) {
    const parsedRequestRecord = parseWarcFile(warcRequestRecord.content);
    return parsedRequestRecord?.headers ? { headers: parsedRequestRecord.headers } : undefined;
  }
  const derived = captureEntry.metadata?.derivedRequestHeaders;
  return derived?.length ? { headers: derived, partial: true } : undefined;
}

function getRequestMethodAndProtocol(
  captureEntry: CaptureEntry,
): { method: string; protocol?: string } | undefined {
  const warcRequestRecord = captureEntry.records?.find((r) => r.type === "warc-request");
  if (warcRequestRecord) {
    const parsedRequestRecord = parseWarcFile(warcRequestRecord.content);
    return { method: parsedRequestRecord.method, protocol: parsedRequestRecord.protocol };
  }
  const derivedProtocol = captureEntry.metadata?.derivedRequestProtocol;
  if (derivedProtocol) {
    return { method: "GET", protocol: derivedProtocol };
  }
  return undefined;
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

    const responseHeadersResult = entry.headerOutput;
    const requestHeadersResult = getRequestHeaders(entry);

    const inlineElementsOf = new Set<unknown[]>();
    if (responseHeadersResult) {
      inlineElementsOf.add(responseHeadersResult);
    }
    if (requestHeadersResult?.headers) {
      inlineElementsOf.add(requestHeadersResult.headers);
    }

    const recordAvailable = Boolean(
      entry.records?.find((r) => ["warc", "arc"].includes(r.type))?.type ?? undefined,
    );
    const archiveFilename = mainCdxEntry.filename;
    const recordFormat = archiveFilename ? parseRecordFormatFromArchiveFilename(archiveFilename) : undefined;

    const contentLengthHeaderSize = getContentLengthHeader(entry.headerOutput);
    const contentEncoding = getHeaderValue(entry.headerOutput, "content-encoding");
    const captureDataPath = path.join(archivalDir, `${outputFilename}.capture.json`);
    const requestMethodAndProtocol = getRequestMethodAndProtocol(entry);
    const captureData: CaptureDataJson = {
      url: entry.url,
      captureTime: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      captureTimePrecise: entry.captureTimestampPrecise ?? undefined,
      mementoTime: entry.mementoDateTime
        ? entry.mementoDateTime.toISO({ suppressMilliseconds: true })
        : undefined,
      hostIp: entry.hostIp,
      request: {
        protocol: requestMethodAndProtocol?.protocol,
        method: requestMethodAndProtocol?.method ?? "GET",
        headers: requestHeadersResult?.headers,
        headersDerived: requestHeadersResult?.partial ? true : undefined,
      },
      response: {
        protocol: entry.responseProtocol,
        statusCode: entry.statusCode,
        statusText: entry.statusMessage,
        headers: entry.headerOutput,
        headersDerived: entry.headersDerived ? true : undefined,
        body: {
          contentSize: entry.content?.length,
          compressedSize:
            contentEncoding &&
            contentLengthHeaderSize !== undefined &&
            contentLengthHeaderSize < (entry.content?.length ?? 0)
              ? contentLengthHeaderSize
              : undefined,
          contentEncoding: contentEncoding ?? undefined,
          mimeType: entry.mimetype,
          sha256: entry.originalSha256 ?? entry.sha256,
          digest: entry.actualDigest,
        },
      },
      modificationTime: entry.lastModified
        ? entry.lastModified.toISO({ suppressMilliseconds: true })
        : undefined,
      modificationTimePrecise: entry.lastModifiedPrecise ?? undefined,
      modificationTimePreciseCandidates: entry.lastModifiedPreciseCandidates ?? undefined,
      classification: entry.classification,
      corrections: entry.corrections,
      validationErrors: entry.metadata?.validationErrors,
      source: {
        provider: entry.cdxEntry.source,
        recordFormat,
        recordAvailable,
        cdxEntry: cdxToOutputData(mainCdxEntry),
        cdxEntryRevisitResolved: resolvedRevisitCdxEntry
          ? cdxToOutputData(resolvedRevisitCdxEntry)
          : undefined,
        additionalSources: entry.additionalSources?.map((source) => ({
          provider: source.source,
          cdxEntry: cdxToOutputData(source.cdxEntry),
        })),
        crawlInfo: entry.metadata?.crawlInfo,
        archiveFileInfo: entry.metadata?.archiveFileInfo,
        wayback: entry.metadata?.wayback,
        commonCrawl: entry.metadata?.commonCrawl,
      },
    };
    fs.writeFileSync(captureDataPath, stringifyWithInlineTuples(captureData, inlineElementsOf));
    const mtime = new Date(entry.captureTimestamp.toJSDate());

    if (entry.records?.length) {
      const isArc = entry.records.some((r) => r.type === "arc");
      const isWarc = entry.records.some((r) => r.type === "warc");
      if (isArc) {
        const header = entry.records.find((r) => r.type === "arc-header");
        const content = entry.records.find((r) => r.type === "arc");
        if (!header || !content) {
          throw new Error(
            `Expected both archeader and arc records for capture with arc record, but got header: ${header?.type} and content: ${content?.type}`,
          );
        }
        const arcHeader = header.content;
        const buffer = content.content;
        fs.writeFileSync(
          path.join(archivalDir, `${outputFilename}.arc`),
          Buffer.concat([arcHeader, buffer]),
        );
        fs.utimesSync(path.join(archivalDir, `${outputFilename}.arc`), mtime, mtime);
      }
      if (isWarc) {
        const warcRecords = entry.records.filter((r) => r.type.startsWith("warc"));
        fs.writeFileSync(
          path.join(archivalDir, `${outputFilename}.warc`),
          Buffer.concat(warcRecords.map((r) => r.content)),
        );
        fs.utimesSync(path.join(archivalDir, `${outputFilename}.warc`), mtime, mtime);
      }
    }
  });
}
