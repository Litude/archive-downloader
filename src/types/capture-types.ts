import { DateTime } from "luxon";

export interface CaptureEntry {
  timestamp: string; // same as captureTimestamp but as string YYYYMMDDHHmmss
  captureTimestamp: DateTime<true>;
  lastModified: DateTime<true> | null;
  url: string;
  statusCode: string;
  classification: CaptureClassification;
  mimetype: string;
  waybackDigest: string;
  actualDigest: string;
  waybackFilename?: string;
  waybackLength?: number;
  sha256: string; // always the sha256 of the file as saved
  originalSha256?: string; // if file is somehow post-processed, this is the sha256 of the original downloaded file
  content: Buffer<ArrayBufferLike>;
  downloadStatus: string;
  headers?: Record<string, string>;
  metadata?: Record<string, any>;
}

export type CaptureClassification = "ok" | "corrupt" | "not_found" | "transient_retry" | "redirect" | "unavailable" | "skipped" | "forbidden";