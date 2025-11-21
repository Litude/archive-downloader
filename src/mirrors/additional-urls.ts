import { UrlEntry } from "../types/download-input-types";

export function createAdditionalUrls(
  additionalUrls: string[],
  maxTimestamp?: string,
  minTimestamp?: string
) {
  const parsed: UrlEntry[] = [];
  for (const url of additionalUrls) {
    parsed.push({ url, mirrorUrl: true, maxTimestamp: maxTimestamp, minTimestamp: minTimestamp });
  }
  return parsed;
}
