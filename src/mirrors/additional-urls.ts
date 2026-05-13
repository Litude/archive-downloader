import { UrlEntry } from "../types/download-input-types.js";
import { MirrorUrlData } from "../types/website-types.js";
import { parseTrailingSlashMode, TrailingSlashParsingMode } from "../url/trailing-slash.js";
import { urlIsIpv4Address } from "../utils/address.js";

export function createAdditionalUrls(
  additionalUrls: (string | MirrorUrlData)[],
  maxTimestamp?: string,
  minTimestamp?: string,
  trailingSlashParsingMode?: TrailingSlashParsingMode,
) {
  const parsed: UrlEntry[] = [];
  for (const url of additionalUrls) {
    if (typeof url === "string") {
      parsed.push({
        url,
        mirrorUrl: true,
        additionalUrl: true,
        excludeInvalid: urlIsIpv4Address(url),
        maxTimestamp: maxTimestamp,
        minTimestamp: minTimestamp,
        trailingSlashParsingMode,
      });
    } else {
      parsed.push({
        url: url.url,
        mirrorUrl: true,
        additionalUrl: true,
        excludeInvalid: url.excludeInvalid ?? urlIsIpv4Address(url.url),
        maxTimestamp: url.maxTimestamp ?? maxTimestamp,
        minTimestamp: url.minTimestamp ?? minTimestamp,
        trailingSlashParsingMode:
          parseTrailingSlashMode(url.trailingSlashParsingMode) ?? trailingSlashParsingMode,
      });
    }
  }
  return parsed;
}
