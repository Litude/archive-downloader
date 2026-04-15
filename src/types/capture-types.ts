import { DateTime } from "luxon";
import { CdxEntry, ExtendedCdxEntry } from "./wayback-types.js";
import { RawHeader } from "../headers/raw-header-parser.js";
import { DataCorrection } from "../data-corrections/data-correction.js";
import { ValidationError } from "../validation/validate-capture.js";

export interface CaptureWaybackMetadata {
  item: {
    id: string;
    title: string;
    contributor?: string;
    creator?: string;
    sponsor?: string;
    description: string;
    coverage?: string;
    notes?: string;
    crawler?: string;
    crawlJob?: string;
    scanningCenter?: string;
    scanner?: string;
    numPages?: number;
    scanDate?: string; // some local time, usually YYYYMMDDHHMMSS format
    firstFileDate?: string; // some local time, usually YYYYMMDDHHMMSS format
    firstFileSerial?: string;
    lastFileDate?: string; // some local time, usually YYYYMMDDHHMMSS format
    lastFileSerial?: string;
    addedDate?: string; // YYYY-MM-DD HH:MM:SS format
    numArcs?: number;
    numWarcs?: number;
    collections: {
      id: string;
      title: string;
      description: string;
    }[];
  };
}

export interface CaptureCommonCrawlMetadata {
  fetchTimestamp?: string;
  collection: {
    id: string;
    title: string;
    publishDate?: string; // YYYY-MM-DD format
    from: string; // ISO 8601, e.g. "2026-03-05T07:07:56"
    to: string; // ISO 8601, e.g. "2026-03-17T14:32:36"
    authors?: string[];
    announcementUrl?: string;
    description?: string;
    numPages?: number;
    numUrls?: number;
    numDigests?: number;
  };
}

export interface CrawlInfoMetadata {
  crawler?: string;
  ip?: string;
  hostname?: string;
  crawlJob?: string;
  description?: string;
  publisher?: string;
  operator?: string;
  format?: string;
  robots?: string;
  conformsTo?: string;
}

export interface ArchiveRecord {
  type:
    | "arc"
    | "arc-header"
    | "warc"
    | "warc-info"
    | "warc-request"
    | "warc-metadata"
    | "warc-unknown";
  content: Buffer;
}

export type CorruptClassificationDetails =
  | { reason: "empty_content" }
  | { reason: string; downloadedSize: number; actualSize: number | null };

export type NotFoundClassificationDetails = { reason: "not_found_string_detected" };

export type Classification =
  | { type: "ok" }
  | { type: "corrupt"; details?: CorruptClassificationDetails }
  | { type: "not_found"; details?: NotFoundClassificationDetails }
  | { type: "transient_retry" }
  | { type: "redirect" }
  | { type: "unavailable" }
  | { type: "skipped" }
  | { type: "bad_request" }
  | { type: "origin_error" }
  | { type: "forbidden" };

export type CaptureClassification = Classification["type"];

export interface CaptureEntry {
  timestamp: string; // same as captureTimestamp but as string YYYYMMDDHHmmss
  captureTimestamp: DateTime<true>;
  captureTimestampPrecise?: string;
  mementoDateTime?: DateTime<true>;
  cdxEntry: ExtendedCdxEntry;
  lastModified: DateTime<true> | null;
  lastModifiedPrecise?: string;
  lastModifiedPreciseCandidates?: string[];
  url: string;
  statusCode?: number;
  statusMessage?: string;
  classification: Classification;
  mimetype: string;
  actualDigest?: string;
  sha256?: string; // always the sha256 of the file as saved
  originalSha256?: string; // if file is somehow post-processed, this is the sha256 of the original downloaded file
  content?: Buffer<ArrayBufferLike>;
  downloadStatus: "downloaded" | "digest-match" | "skipped" | "unavailable";
  responseHeaders?: Record<string, string>;
  rawResponseHeaders?: RawHeader[];
  derivedHeaders?: RawHeader[];
  hostIp?: string;
  responseProtocol?: string;
  headerOutput?: RawHeader[];
  captureIndex?: number; // set when filename has _N suffix due to duplicate timestamp+flags
  contentIndex?: number | null; // set when multiple captures have same content and timestamp, so only one file is saved but all get an index to indicate they are part of the same group
  records?: ArchiveRecord[];
  additionalSources?: {
    source: string;
    cdxEntry: CdxEntry;
  }[];
  corrections?: DataCorrection[];
  metadata?: {
    wayback?: CaptureWaybackMetadata;
    commonCrawl?: CaptureCommonCrawlMetadata;
    crawlInfo?: CrawlInfoMetadata;
    validationErrors?: ValidationError[];
  };
}
