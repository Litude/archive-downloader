import { Classification, CaptureWaybackMetadata, CaptureCommonCrawlMetadata } from "./capture-types.js";
import { RawHeader } from "../utils/raw-header-parser.js";

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
  /** ISO 8601 datetime with nanosecond precision, only available for Common Crawl captures */
  captureTimePrecise?: string;
  status?: number;
  mimeType: string;
  /** ISO 8601 datetime from Last-Modified header */
  modificationTime?: string;
  /** ISO 8601 datetime with nanosecond precision derived from IIS ETag */
  modificationTimePrecise?: string;
  /** Multiple candidate modification times when ETag parsing is ambiguous */
  modificationTimePreciseCandidates?: string[];
  headers?: {
    original?: RawHeader[];
    reconstructed?: RawHeader[];
  };
  captureData: {
    source: string;
    contentSize?: number;
    contentSha256?: string;
    contentDigest?: string;
    hostIp?: string;
    protocol?: string;
    archiveRecordFormat?: "warc" | "arc";
    archiveRecordAvailable: boolean;
    classification: Classification;
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
    validationErrors?: {
      type: string;
      details?: unknown;
    }[];
  };
}
