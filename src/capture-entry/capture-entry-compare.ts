import { CaptureEntry } from "../types/capture-types.js";
import { urlCompare } from "../url/url-compare.js";

export function compareCaptureEntries(a: CaptureEntry, b: CaptureEntry): number {
  const timestampComparison = a.timestamp.localeCompare(b.timestamp);
  if (timestampComparison !== 0) {
    return timestampComparison;
  }
  const urlComparison = urlCompare(a.url, b.url);
  return urlComparison;
}
