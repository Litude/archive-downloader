import { CaptureClassification } from "./capture-types";
import { Transformation } from "./transformation-types";
import { QueryHashParameter } from "./website-types";

export interface DownloadFileInput {
  urls: UrlEntry[];
  filename: Filename;
  outputDirectory: string;
  transformations: Transformation[];
  queryHashParameters?: QueryHashParameter[];
  classifications?: Record<string, CaptureClassification>;
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
}

export interface Filename {
  base: string;
  ext: string;
  timestamp?: string; // TODO: Or date or something else?
  flags?: string;
  queryParams?: Record<string, string>;
  queryHashParameters?: QueryHashParameter[]
}
