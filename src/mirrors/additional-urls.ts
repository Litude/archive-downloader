import { UrlEntry } from "../types/download-input-types";
import { MirrorUrlData } from "../types/website-types";
import { urlIsIpv4Address } from "../utils/address";

export function createAdditionalUrls(
  additionalUrls: (string | MirrorUrlData)[],
  maxTimestamp?: string,
  minTimestamp?: string
) {
  const parsed: UrlEntry[] = [];
  for (const url of additionalUrls) {
    if (typeof url === "string") {
      parsed.push({
        url,
        mirrorUrl: true,
        excludeInvalid: urlIsIpv4Address(url),
        maxTimestamp: maxTimestamp,
        minTimestamp: minTimestamp
      });
    }
    else {
      parsed.push({
        url: url.url,
        mirrorUrl: true,
        excludeInvalid: url.excludeInvalid ?? urlIsIpv4Address(url.url),
        maxTimestamp: url.maxTimestamp ?? maxTimestamp,
        minTimestamp: url.minTimestamp ?? minTimestamp
      });
    }
  }
  return parsed;
}
