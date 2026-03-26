import { CaptureClassification } from "./capture-types.js";

export interface QueryHashParameter {
  paramName: string;
  outputName?: string;
  outputValue?: string;
  pattern: string;
  captureGroups: number[];
  required?: boolean;
}

export interface WebsiteFileEntryJson {
  url?: string;
  urls?: (string | { url: string; maxTimestamp?: string; minTimestamp?: string })[];
  additionalMirrors?: (string | MirrorUrlData)[];
  transformations?: TransformationJson[];
  filename?: string;
  queryParams?: Record<string, string>;
  queryHashParameters?: QueryHashParameter[];
  maxTimestamp?: string;
  minTimestamp?: string;
  additionalUrls?: (string | MirrorUrlData)[];
  classifications?: Record<string, CaptureClassification>;
  skippedCaptures?: {
    url: string; // must match CDX index url exactly
    timestamp: string;
  }[];
  /** @deprecated should be handled by classifier or by getting all headers */
  excludedCaptures?: string[];
  /** @deprecated should be handled by getting all headers */
  skippedFileWriteCaptures?: string[]; // supposed to be used when later captures that are identical in content actually have better modify date timestamps
  /** @deprecated should be handled by getting all headers */
  forcedUniqueEntries?: { urls: string[]; timestamps?: string[] };
  /** @deprecated use transformation */
  normalizeTrackingImageUrl?: boolean;
}

export interface TransformationJson {
  name: string;
  options?: Record<string, any>;
}

export interface MirrorData {
  url: string;
  mirrors: (string | MirrorUrlData)[];
}

export interface MirrorUrlData {
  url: string;
  maxTimestamp?: string;
  minTimestamp?: string;
  excludeInvalid?: boolean;
}
