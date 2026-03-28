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
import { RawHeader } from "../../utils/raw-header-parser.js";

function checkIfTruncated(
  content: Buffer,
  headers: RawHeader[],
  metadata: RawHeader[] | undefined,
) {
  // Sanity check: Received content size smaller than actual size
  const contentLengthHeader = headers.find(([k, _]) => k.toLowerCase() === "content-length");
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader[1], 10);
    const actualContentLength = content.length;
    if (actualContentLength < contentLength) {
      return {
        reason: "truncated",
        downloadedSize: actualContentLength,
        actualSize: contentLength,
      };
    }
  }
  // Common Crawl specific header present in old arcs
  const commonCrawlTruncatedHeader = metadata?.find(
    ([k, _]) => k.toLowerCase() === "x-commoncrawl-contenttruncated",
  );
  if (commonCrawlTruncatedHeader) {
    return {
      reason: "truncated",
      downloadedSize: content.length,
      actualSize: null,
    };
  }
  const warcTruncatedHeader = headers.find(([k, _]) => k.toLowerCase() === "warc-truncated");
  if (warcTruncatedHeader) {
    return {
      reason: "truncated",
      downloadedSize: content.length,
      actualSize: null,
    };
  }

  if (content.length === 1048576) {
    // Heuristic: Common Crawl truncates ARC/WARC records to 1 MiB when they exceed a certain size. If we get exactly 1 MiB, it's possible the record was truncated. We can't be sure without the actual size, so we mark it as potentially truncated.
    console.warn(
      `Received common crawl content of exactly 1 MiB, which may indicate truncation. Content length: ${content.length} bytes.`,
    );
  }

  return undefined;
}

// Some collections have a metadata header that is included in the content length but not in the actual content

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
    metadataPrefixes: collectionCleanupData?.metadataHeaderPrefixes,
    contentLengthIncludesTrailingNewline:
      collectionCleanupData?.contentLengthIncludesTrailingNewline ?? false,
  };

  try {
    const parsed = isArc
      ? parseArcFile(buffer, arcCleanupData)
      : parseWarcFile(buffer, {
          undoCommonCrawlHeaderNaming: true,
          extraBlankLineAfterHeaders: collectionCleanupData?.extraBlankLineAfterHeaders,
        });
    const responseHeaders = Object.fromEntries(
      parsed.headers.map(([k, v]) => [k.toLowerCase(), v]),
    );

    const contentTruncationDetails = checkIfTruncated(
      parsed.content,
      parsed.headers,
      parsed.metadata,
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
        classification: contentTruncationDetails ? "corrupt" : undefined,
        contentTruncationDetails: contentTruncationDetails
          ? {
              downloadErrorDetails: contentTruncationDetails,
            }
          : undefined,
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
        classification: contentTruncationDetails ? "corrupt" : undefined,
        contentTruncationDetails: contentTruncationDetails
          ? {
              downloadErrorDetails: contentTruncationDetails,
            }
          : undefined,
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
