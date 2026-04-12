import { TrailingSlashParsingMode } from "../url/trailing-slash.js";
import { CaptureClassification } from "./capture-types.js";
import { Transformation } from "./transformation-types.js";
import { QueryHashParameter } from "./website-types.js";

export interface DownloadFileInput {
  urls: UrlEntry[];
  filename: Filename;
  outputDirectory: string;
  commonCrawlEnabled?: boolean;
  commonCrawlCollections?: string[];
  transformations: Transformation[];
  queryHashParameters?: QueryHashParameter[];
  classifications?: Record<string, CaptureClassification>;
  skippedCaptures?: {
    url: string; // must match CDX index url exactly
    timestamp: string;
  }[];
}

export interface LimitedCaptureRange {
  startTimestamp: string;
  endTimestamp: string;
  capturesPerDay: number;
  mirrorCapturesPerDay?: number;
}

export interface LimitedCaptureConfig {
  startTimestamp: string;
  endTimestamp: string;
  threshold: number;
  capturesPerDay: number;
  mirrorCapturesPerDay?: number;
}

export interface UrlEntry {
  url: string;
  mirrorUrl?: boolean;
  excludeInvalid?: boolean;
  maxTimestamp?: string;
  minTimestamp?: string;
  trailingSlashParsingMode?: TrailingSlashParsingMode;
}

export interface Filename {
  base: string;
  ext: string;
  timestamp?: string; // TODO: Or date or something else?
  flags?: string;
  queryParams?: Record<string, string>;
  queryHashParameters?: QueryHashParameter[];
}
