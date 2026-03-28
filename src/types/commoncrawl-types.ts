import { RawHeader } from "../headers/raw-header-parser.js";
import { ArchiveRecord } from "./capture-types.js";

export interface CommonCrawlCollection {
  id: string;
  name: string;
  timegate: string;
  "cdx-api": string;
  from: string; // ISO 8601, e.g. "2026-03-05T07:07:56"
  to: string; // ISO 8601, e.g. "2026-03-17T14:32:36"
}

export interface CommonCrawlCdxEntry {
  urlkey: string;
  timestamp: string; // YYYYMMDDHHmmss
  url: string;
  mime: string;
  "mime-detected": string;
  status: string; // numeric as string, e.g. "200"
  digest: string; // "SHA256:<base32>"
  length: string;
  offset: string;
  filename: string; // S3 path to WARC file
  languages?: string;
  encoding?: string;
}

export interface CommonCrawlDownloadedFile {
  content: Buffer;
  url: string;
  timestamp: string;
  responseHeaders: Record<string, string>;
  rawResponseHeaders: RawHeader[];
  statusCode: number;
  collection?: CommonCrawlCollection;
  classification?: "corrupt" | "unavailable";
  hostIp?: string;
  protocol?: string;
  metadata?: RawHeader[];
  /** Raw decompressed record bytes. For WARC files includes the warcinfo record first. */
  records: ArchiveRecord[];
  contentTruncationDetails?: {
    downloadErrorDetails: {
      reason: string;
      downloadedSize: number;
      actualSize: number | null;
    };
  };
}

export interface CommonCrawlDownloaderOptions {
  /** Milliseconds to wait between each API request. Default: COMMONCRAWL_REQUEST_DELAY_MS */
  requestDelayMs?: number;
  /** Timeout in milliseconds for each request. Default: COMMONCRAWL_REQUEST_TIMEOUT */
  requestTimeoutMs?: number;
}
