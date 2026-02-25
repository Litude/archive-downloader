import path from "path";
import JSON5 from "json5";
import fs from "fs";
import { timestampMax, timestampMin } from "../utils/timestamp";
import { UrlEntry } from "../types/download-input-types";
import { MirrorData } from "../types/website-types";

function normalizeUrl(url: string): string {
    let normalized = url;
    if (normalized.startsWith('http://')) {
        normalized = normalized.slice(7);
    }
    if (normalized.startsWith('https://')) {
        normalized = normalized.slice(8);
    }
    if (normalized.startsWith('www.')) {
        normalized = normalized.slice(4);
    }
    return normalized;
}

let defaultMirrors: MirrorData[] | null = null;
function loadDefaultMirrors(): MirrorData[] {
  if (defaultMirrors !== null) {
    return defaultMirrors;
  }
  const mirrorData: MirrorData[] = JSON5.parse(fs.readFileSync(path.join(__dirname, '../../data/settings/mirrors.json'), 'utf-8'));
  defaultMirrors = mirrorData;
  return mirrorData;
};

// Timestamps can be limited at several levels:
// - Global max/min timestamps for all urls in a json file
// - Per-url max/min timestamps in a json file
// - Per-file max/min timestamps in a json file
// - Per-mirror max timestamps in mirrors.json

// This function ONLY handles mirror specific timestamps
// - If a mirror has a max/min timestamp, it will clamp timestamp from other sources

export function createMirrorUrlsWithConfig(
  urls: UrlEntry[],
  additionalMirrors: (string | MirrorData)[],
  mirrorData: MirrorData[],
): UrlEntry[] {
  const parsed: UrlEntry[] = [];
  for (const urlEntry of urls) {
    // Always add the original url first
    parsed.push({ url: urlEntry.url, maxTimestamp: urlEntry.maxTimestamp, minTimestamp: urlEntry.minTimestamp });

    // Lookup common mirrors defined in mirrors.json
    const urlObj = new URL(urlEntry.url);
    const hostname = urlObj.hostname;
    const cleanedUrl = normalizeUrl(hostname);
    const availableBaseMirrors = mirrorData.find(m => normalizeUrl(m.url) === cleanedUrl);
    // Preserve pathname, query parameters, and hash fragment
    const pathAndParams = urlObj.pathname + urlObj.search + urlObj.hash;
    if (availableBaseMirrors) {
      for (const mirror of availableBaseMirrors.mirrors) {
        if (typeof mirror === "string") {
          parsed.push({ url: `${mirror}${pathAndParams}`, mirrorUrl: true, maxTimestamp: urlEntry.maxTimestamp, minTimestamp: urlEntry.minTimestamp });
        }
        else {
          const maxTimestamp = timestampMin(mirror.maxTimestamp, urlEntry.maxTimestamp);
          const minTimestamp = timestampMax(mirror.minTimestamp, urlEntry.minTimestamp);
          parsed.push({ url: `${mirror.url}${pathAndParams}`, mirrorUrl: true, maxTimestamp, minTimestamp });
        }
      }
    }

    // Add special mirrors defined in the site json file
    for (const mirror of additionalMirrors) {
      if (typeof mirror === "string") {
        parsed.push({ url: `${mirror}${pathAndParams}`, mirrorUrl: true, maxTimestamp: urlEntry.maxTimestamp, minTimestamp: urlEntry.minTimestamp });
      } else {
        if (normalizeUrl(mirror.url) === cleanedUrl) {
          for (const m of mirror.mirrors) {
            if (typeof m === "string") {
              parsed.push({ url: `${m}${pathAndParams}`, mirrorUrl: true, maxTimestamp: urlEntry.maxTimestamp, minTimestamp: urlEntry.minTimestamp });
            }
            else {
              const maxTimestamp = timestampMin(m.maxTimestamp, urlEntry.maxTimestamp);
              const minTimestamp = timestampMax(m.minTimestamp, urlEntry.minTimestamp);
              parsed.push({ url: `${m.url}${pathAndParams}`, mirrorUrl: true, maxTimestamp, minTimestamp });
            }
          }
        }
      }
    }
  }

  return parsed;
}

export function createMirrorUrls(
  urls: UrlEntry[],
  additionalMirrors: (string | MirrorData)[],
): UrlEntry[] {
  const mirrorData = loadDefaultMirrors();
  return createMirrorUrlsWithConfig(urls, additionalMirrors, mirrorData);
}
