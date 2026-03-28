import path from "path";
import fs from "fs";
import { CaptureEntry } from "../types/capture-types.js";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { getMostLikelyEtagDate, parseIisEtagDate } from "../utils/iis-etag-parser.js";
import { DateTime } from "luxon";
import { logWarning } from "../utils/log-context.js";
import { CdxEntry } from "../types/wayback-types.js";
import { CaptureDataJson, CdxEntryJson } from "../types/capture-data-json.js";

function getCaptureHeaderValue(captureEntry: CaptureEntry, headerName: string): string | undefined {
  const header = captureEntry.headerOutput?.original?.find(
    (h) => h[0].toLowerCase() === headerName.toLowerCase(),
  );
  if (header) {
    return header[1];
  }
  const reconstructedHeader = captureEntry.headerOutput?.reconstructed?.find(
    (h) => h[0].toLowerCase() === headerName.toLowerCase(),
  );
  if (reconstructedHeader) {
    return reconstructedHeader[1];
  }
  return undefined;
}

function getExactModificationDate(
  captureEntry: CaptureEntry,
): { modificationTimePrecise?: string; plausiblePreciseModificationDates?: string[] } | null {
  const likelyIisServer = getCaptureHeaderValue(captureEntry, "server")
    ?.toLowerCase()
    .includes("microsoft-iis");
  try {
    const etagHeader = getCaptureHeaderValue(captureEntry, "etag");
    if (etagHeader && captureEntry.lastModified) {
      const etagDates = getMostLikelyEtagDate(
        etagHeader,
        captureEntry.captureTimestamp,
        captureEntry.lastModified,
      );
      if (etagDates) {
        if (etagDates.length === 1) {
          return { modificationTimePrecise: etagDates[0] };
        } else if (etagDates.length > 1) {
          return { plausiblePreciseModificationDates: etagDates };
        }
      }
    } else if (etagHeader && likelyIisServer) {
      const etagDates = parseIisEtagDate(etagHeader, captureEntry.captureTimestamp);
      if (etagDates) {
        if (etagDates.length === 1) {
          logWarning(
            `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found 1 plausible match.`,
            "iis-etag-parser",
          );
          return { modificationTimePrecise: etagDates[0] };
        } else if (etagDates.length > 1) {
          if (etagDates[0].endsWith("0000000000Z")) {
            logWarning(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`,
              "iis-etag-parser",
            );
            console.warn(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`,
            );
            return {
              modificationTimePrecise: etagDates[0],
              plausiblePreciseModificationDates: etagDates,
            };
          } else {
            logWarning(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")} but unable to pick.`,
              "iis-etag-parser",
            );
            console.warn(
              `Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")}.`,
            );
            return { plausiblePreciseModificationDates: etagDates };
          }
        }
      }
    }
    return null;
  } catch (e) {
    if (likelyIisServer) {
      logWarning(
        `Parsing IIS ETag header for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })} failed.`,
        "iis-etag-parser",
      );
    }
    console.error(
      `Error parsing ETag for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO()}:`,
      e,
    );
    return null;
  }
}

function getExactCaptureDate(captureEntry: CaptureEntry): string | null {
  if (captureEntry.metadata?.commoncrawl?.fetchTimestamp) {
    return DateTime.fromJSDate(new Date(captureEntry.metadata.commoncrawl.fetchTimestamp)).toFormat(
      "yyyy-MM-dd'T'HH:mm:ss.SSS'000000Z'",
    );
  }
  return null;
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

    const exactModificationDate = getExactModificationDate(entry);
    if (!exactModificationDate && getCaptureHeaderValue(entry, "etag") && entry.lastModified) {
      console.log(
        `Could not determine exact modification date for ${entry.url} captured at ${entry.captureTimestamp.toISO({ suppressMilliseconds: true })}`,
      );
    }
    const exactCaptureDate = getExactCaptureDate(entry);

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
      captureTimePrecise: exactCaptureDate ?? undefined,
      status: entry.statusCode,
      mimeType: entry.mimetype,
      modificationTime: entry.lastModified
        ? entry.lastModified.toISO({ suppressMilliseconds: true })
        : undefined,
      modificationTimePrecise: exactModificationDate?.modificationTimePrecise ?? undefined,
      modificationTimePreciseCandidates:
        exactModificationDate?.plausiblePreciseModificationDates ?? undefined,
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
