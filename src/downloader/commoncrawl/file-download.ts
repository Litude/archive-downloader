import { ArcParsingOptions, parseArcFile } from "../../archive-record/arc.js";
import { parseWarcFile } from "../../archive-record/warc.js";
import { fetchRangeBytes } from "../../utils/fetch-range-bytes.js";
import { fetchWarcGlobalHeader } from "../../utils/fetch-warc-global-header.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import {
  CommonCrawlDownloadedFile,
  CommonCrawlDownloaderOptions,
} from "../../types/commoncrawl-types.js";
import {
  COMMONCRAWL_DOWNLOAD_BASE,
  COMMONCRAWL_INITIAL_BACKOFF,
  COMMONCRAWL_MAX_BACKOFF,
  COMMONCRAWL_REQUEST_TIMEOUT,
} from "./commoncrawl-common.js";
import { commonCrawlCleanupData } from "./commoncrawl-cleanup.js";
import { getCommonCrawlCollection } from "./collections.js";

export async function downloadCommonCrawlFile(
  entry: ExtendedCdxEntry,
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlDownloadedFile> {
  if (entry.filename === undefined || entry.offset === undefined || entry.length === undefined) {
    throw new Error(
      `CDX entry for ${entry.url} (${entry.timestamp}) is missing filename, offset, or length`,
    );
  }

  const url = `${COMMONCRAWL_DOWNLOAD_BASE}${entry.filename}`;
  const timeout = options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT;
  const fetchOptions = {
    timeout,
    initialBackoff: COMMONCRAWL_INITIAL_BACKOFF,
    maxBackoff: COMMONCRAWL_MAX_BACKOFF,
  };

  const buffer = await fetchRangeBytes(url, entry.offset, entry.length, fetchOptions);

  const isArc = entry.filename.endsWith(".arc.gz");

  const collectionCleanupData = commonCrawlCleanupData[entry.collection ?? ""];
  const arcCleanupData: ArcParsingOptions = {
    metadataPrefix: collectionCleanupData?.metadataHeaderPrefix,
    contentLengthIncludesTrailingNewline:
      collectionCleanupData?.contentLengthIncludesTrailingNewline ?? false,
  };

  try {
    const parsed = isArc ? parseArcFile(buffer, arcCleanupData) : parseWarcFile(buffer);
    const responseHeaders = Object.fromEntries(
      parsed.headers.map(([k, v]) => [k.toLowerCase(), v]),
    );

    const collection = getCommonCrawlCollection(entry.collection ?? "");

    if (isArc) {
      return {
        content: parsed.content,
        url: entry.url,
        timestamp: entry.timestamp,
        responseHeaders,
        rawResponseHeaders: parsed.headers,
        statusCode: parsed.status,
        hostIp: parsed.ip || undefined,
        protocol: parsed.protocol || undefined,
        metadata: parsed.metadata,
        collection,
        records: [{ type: "arc", content: buffer }],
      };
    } else {
      const warcinfoBuffer = await fetchWarcGlobalHeader(url, fetchOptions);
      return {
        content: parsed.content,
        url: entry.url,
        timestamp: entry.timestamp,
        responseHeaders,
        rawResponseHeaders: parsed.headers,
        statusCode: parsed.status,
        hostIp: parsed.ip || undefined,
        protocol: parsed.protocol || undefined,
        metadata: parsed.metadata,
        collection,
        records: [
          { type: "warcinfo", content: warcinfoBuffer },
          { type: "warc", content: buffer },
        ],
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to parse ${isArc ? "ARC" : "WARC"} record for ${entry.url} (${entry.timestamp}): ${errorMessage}`,
    );
    return {
      content: Buffer.alloc(0),
      url: entry.url,
      timestamp: entry.timestamp,
      responseHeaders: {},
      rawResponseHeaders: [],
      statusCode: 0,
      classification: "corrupt",
      records: [{ type: isArc ? "arc" : "warc", content: buffer }],
    };
  }
}
