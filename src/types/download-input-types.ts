import { CaptureClassification } from "./capture-types";
import { Transformation } from "./transformation-types";
import { QueryHashParameter } from "./website-types";

export interface DownloadFileInput {
  urls: UrlEntry[];
  filename: Filename;
  outputDirectory: string;
  limitedCaptures: LimitedCaptureRange[];
  transformations: Transformation[];
  queryHashParameters?: QueryHashParameter[];
  classifications?: Record<string, CaptureClassification>;
}


export interface LimitedCaptureRange {
  url: string;
  startTimestamp: string;
  endTimestamp: string;
  capturesPerDay: number;
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
