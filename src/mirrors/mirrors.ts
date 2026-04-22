import path, { dirname } from "path";
import JSON5 from "json5";
import fs from "fs";
import { timestampMax, timestampMin } from "../utils/timestamp.js";
import { UrlEntry } from "../types/download-input-types.js";
import { MirrorData, MirrorUrlData } from "../types/website-types.js";
import { urlIsIpv4Address } from "../utils/address.js";
import { fileURLToPath } from "url";
import { TrailingSlashParsingMode } from "../url/trailing-slash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function normalizeUrl(url: string): string {
  let normalized = url;
  if (normalized.startsWith("http://")) {
    normalized = normalized.slice(7);
  }
  if (normalized.startsWith("https://")) {
    normalized = normalized.slice(8);
  }
  if (normalized.startsWith("www.")) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

let defaultMirrors: MirrorData[] | null = null;
function loadDefaultMirrors(): MirrorData[] {
  if (defaultMirrors !== null) {
    return defaultMirrors;
  }
  const mirrorData: MirrorData[] = JSON5.parse(
    fs.readFileSync(path.join(__dirname, "../../data/settings/mirrors.json"), "utf-8"),
  );
  defaultMirrors = mirrorData;
  return mirrorData;
}

// Timestamps can be limited at several levels:
// - Global max/min timestamps for all urls in a json file
// - Per-url max/min timestamps in a json file
// - Per-file max/min timestamps in a json file
// - Per-mirror max timestamps in mirrors.json

// This function ONLY handles mirror specific timestamps
// - If a mirror has a max/min timestamp, it will clamp timestamp from other sources

function toMirrorUrlData(mirror: string | MirrorUrlData): MirrorUrlData {
  return typeof mirror === "string" ? { url: mirror } : mirror;
}

function collectMirrors(
  url: string,
  mirrorData: MirrorData[],
  additionalMirrors: (string | MirrorData | MirrorUrlData)[],
): MirrorUrlData[] {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  const cleanedUrl = normalizeUrl(hostname);

  const mirrors: MirrorUrlData[] = [];

  // Collect from mirrorData (mirrors.json)
  const baseMirrors = mirrorData.find((m) => normalizeUrl(m.url) === cleanedUrl);
  if (baseMirrors) {
    for (const m of baseMirrors.mirrors) {
      mirrors.push(toMirrorUrlData(m));
    }
  }

  // Collect from additionalMirrors (site json)
  for (const mirror of additionalMirrors) {
    if (typeof mirror === "string") {
      mirrors.push({ url: mirror });
    } else if ("mirrors" in mirror) {
      const mirrorUrlObj = new URL(mirror.url);
      const mirrorHostname = mirrorUrlObj.hostname;
      const cleanedMirrorUrl = normalizeUrl(mirrorHostname);
      const pathname = mirrorUrlObj.pathname;
      if (
        cleanedMirrorUrl === cleanedUrl &&
        (!pathname || urlObj.pathname.toLowerCase().startsWith(pathname.toLowerCase()))
      ) {
        for (const m of mirror.mirrors) {
          mirrors.push(toMirrorUrlData(m));
        }
      }
    } else {
      mirrors.push(mirror);
    }
  }

  return mirrors;
}

export function createMirrorUrlsWithConfig(
  urls: UrlEntry[],
  additionalMirrors: (string | MirrorData | MirrorUrlData)[],
  trailingSlashParsingMode: TrailingSlashParsingMode | undefined,
  mirrorData: MirrorData[],
): UrlEntry[] {
  const parsed: UrlEntry[] = [];
  for (const urlEntry of urls) {
    // Always add the original url first
    parsed.push({
      url: urlEntry.url,
      excludeInvalid: false,
      maxTimestamp: urlEntry.maxTimestamp,
      minTimestamp: urlEntry.minTimestamp,
      trailingSlashParsingMode: urlEntry.trailingSlashParsingMode ?? trailingSlashParsingMode,
    });

    // Lookup common mirrors defined in mirrors.json
    const urlObj = new URL(urlEntry.url);
    // Preserve pathname, query parameters, and hash fragment
    const pathAndParams = urlObj.pathname + urlObj.search + urlObj.hash;

    const allMirrors = collectMirrors(urlEntry.url, mirrorData, additionalMirrors);
    const encounteredMirrorUrls = new Set<string>();
    for (const mirror of allMirrors) {
      const url = `${mirror.url}${pathAndParams}`;
      if (!encounteredMirrorUrls.has(url)) {
        encounteredMirrorUrls.add(url);
        parsed.push({
          url,
          mirrorUrl: true,
          excludeInvalid: mirror.excludeInvalid ?? urlIsIpv4Address(mirror.url),
          maxTimestamp: timestampMin(mirror.maxTimestamp, urlEntry.maxTimestamp),
          minTimestamp: timestampMax(mirror.minTimestamp, urlEntry.minTimestamp),
          trailingSlashParsingMode: urlEntry.trailingSlashParsingMode ?? trailingSlashParsingMode,
        });
      }
    }
  }

  return parsed;
}

export function createMirrorUrls(
  urls: UrlEntry[],
  additionalMirrors: (string | MirrorUrlData)[],
  trailingSlashParsingMode?: TrailingSlashParsingMode,
): UrlEntry[] {
  const mirrorData = loadDefaultMirrors();
  return createMirrorUrlsWithConfig(urls, additionalMirrors, trailingSlashParsingMode, mirrorData);
}

export function getMirrorPrefixesForPrefix(
  prefix: string,
  additionalMirrors: (string | MirrorData | MirrorUrlData)[] = [],
): { prefix: string; minTimestamp?: string; maxTimestamp?: string }[] {
  const mirrorData = loadDefaultMirrors();
  const urlObj = new URL(prefix);
  const pathAndParams = urlObj.pathname + urlObj.search + urlObj.hash;
  const mirrors = collectMirrors(prefix, mirrorData, additionalMirrors);
  return mirrors.map((m) => ({
    prefix: `${m.url}${pathAndParams}`,
    minTimestamp: m.minTimestamp,
    maxTimestamp: m.maxTimestamp,
  }));
}
