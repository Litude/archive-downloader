import { DateTime } from "luxon";
import { CdxEntry, ExtendedCdxEntry } from "./wayback-types.js";
import { RawHeader } from "../utils/raw-header-parser.js";

export interface CaptureWaybackMetadata {
  item: {
    id: string;
    title: string;
    contributor?: string;
    sponsor?: string;
    description: string;
    coverage?: string;
    notes?: string;
    crawler?: string;
    crawljob?: string;
    numPages?: number;
    numArcs?: number;
    numWarcs?: number;
    collections: {
      id: string;
      title: string;
      description: string;
    }[];
    firstFileDate?: string;
    lastFileDate?: string;
  };
}

export interface ArchiveRecord {
  type: "arc" | "warc" | "warcinfo";
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
  | { type: "forbidden" };

export type CaptureClassification = Classification["type"];

export interface CaptureEntry {
  timestamp: string; // same as captureTimestamp but as string YYYYMMDDHHmmss
  captureTimestamp: DateTime<true>;
  mementoDateTime?: DateTime<true>;
  cdxEntry: ExtendedCdxEntry;
  lastModified: DateTime<true> | null;
  url: string;
  statusCode?: number;
  classification: Classification;
  mimetype: string; // TODO: Should this be populated from the actual headers when available instead, the CDX index has some pretty bad values here sometimes?
  actualDigest?: string;
  sha256?: string; // always the sha256 of the file as saved
  originalSha256?: string; // if file is somehow post-processed, this is the sha256 of the original downloaded file
  content?: Buffer<ArrayBufferLike>;
  downloadStatus: "downloaded" | "digest-match" | "skipped" | "unavailable";
  responseHeaders?: Record<string, string>;
  rawResponseHeaders?: RawHeader[];
  hostIp?: string;
  protocol?: string;
  headerOutput?: {
    original?: RawHeader[];
    reconstructed?: RawHeader[];
  };
  captureIndex?: number; // set when filename has _N suffix due to duplicate timestamp+flags
  contentIndex?: number | null; // set when multiple captures have same content and timestamp, so only one file is saved but all get an index to indicate they are part of the same group
  records?: ArchiveRecord[];
  additionalSources?: {
    source: string;
    cdxEntry: CdxEntry;
  }[];
  metadata?: {
    wayback?: CaptureWaybackMetadata;
    crawlData?: {
      crawler?: string;
      crawljob?: string;
      description?: string;
      publisher?: string;
      operator?: string;
    };
    validationErrors?: {
      type: string;
      details?: any;
    }[];
  };
}

export function addValidationError(entry: CaptureEntry, error: string, details?: any) {
  if (!entry.metadata) {
    entry.metadata = {};
  }
  if (!entry.metadata.validationErrors) {
    entry.metadata.validationErrors = [];
  }
  entry.metadata.validationErrors.push({ type: error, details });
}
