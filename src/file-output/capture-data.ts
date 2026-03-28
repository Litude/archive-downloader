import path from "path";
import fs from "fs";
import { CaptureEntry } from "../types/capture-types.js";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { CdxEntry } from "../types/wayback-types.js";
import { CaptureDataJson, CdxEntryJson } from "../types/capture-data-json.js";

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
    if (headersResult?.original) {
      inlineElementsOf.add(headersResult.original);
    }
    if (headersResult?.reconstructed) {
      inlineElementsOf.add(headersResult.reconstructed);
    }

    const archiveRecordAvailable = Boolean(
      entry.records?.find((r) => ["warc", "arc"].includes(r.type))?.type ?? undefined,
    );
    const archiveFilename = mainCdxEntry.filename;
    const nonZippedFilename = archiveFilename?.endsWith(".gz")
      ? archiveFilename.slice(0, -3)
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
      status: entry.statusCode,
      mimeType: entry.mimetype,
      modificationTime: entry.lastModified
        ? entry.lastModified.toISO({ suppressMilliseconds: true })
        : undefined,
      modificationTimePrecise: entry.lastModifiedPrecise ?? undefined,
      modificationTimePreciseCandidates: entry.lastModifiedPreciseCandidates ?? undefined,
      headers: headersResult,
      captureData: {
        source: entry.cdxEntry.source,
        contentSize: entry.content?.length,
        contentSha256: entry.originalSha256 ?? entry.sha256,
        contentDigest: entry.actualDigest,
        hostIp: entry.hostIp,
        protocol: entry.protocol,
        archiveRecordFormat,
        archiveRecordAvailable,
        classification: entry.classification,
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
        validationErrors: entry.metadata?.validationErrors,
      },
    };
    fs.writeFileSync(captureDataPath, stringifyWithInlineTuples(captureData, inlineElementsOf));
    const mtime = new Date(entry.captureTimestamp.toJSDate());
    // fs.utimesSync(captureDataPath, mtime, mtime);

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
