import { DateTime } from "luxon";
import { CdxEntry, ExtendedCdxEntry } from "./wayback-types";
import { RawHeader } from "../utils/raw-header-parser";

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
  }
}

export interface ArchiveRecord {
  type: "arc" | "warc" | "warc-header";
  content: Buffer;
}

export interface CaptureEntry {
  timestamp: string; // same as captureTimestamp but as string YYYYMMDDHHmmss
  captureTimestamp: DateTime<true>;
  cdxEntry: ExtendedCdxEntry;
  lastModified: DateTime<true> | null;
  url: string;
  statusCode?: number;
  classification: CaptureClassification;
  mimetype: string;
  // archiveSource: string;
  // archiveDigest?: string;
  actualDigest?: string;
  // archiveFilename?: string;
  // archiveOffset?: number;
  // archiveLength?: number;
  sha256?: string; // always the sha256 of the file as saved
  originalSha256?: string; // if file is somehow post-processed, this is the sha256 of the original downloaded file
  content?: Buffer<ArrayBufferLike>;
  downloadStatus: string;
  headers?: Record<string, string>;
  rawHeaders?: RawHeader[];
  records?: ArchiveRecord[];
  metadata?: {
    wayback?: CaptureWaybackMetadata;
    classificationDetails?: Record<string, any>;
  }
}

export type CaptureClassification = "ok" | "corrupt" | "not_found" | "transient_retry" | "redirect" | "unavailable" | "skipped" | "forbidden";
