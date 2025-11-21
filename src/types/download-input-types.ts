import { Transformation } from "./transformation-types";
import { QueryHashParameter } from "./website-types";

export interface DownloadFileInput {
  urls: UrlEntry[];
  filename: Filename;
  outputDirectory: string;
  limitedCaptures: LimitedCaptureRange[];
  transformations: Transformation[];
  queryHashParameters?: QueryHashParameter[];
}


export interface LimitedCaptureRange {
  url: string;
  startTimestamp: string;
  endTimestamp: string;
  frequency: number;
  unit: 'days' | 'hours' | 'minutes';
}


export interface UrlEntry {
  url: string;
  mirrorUrl?: boolean;
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
