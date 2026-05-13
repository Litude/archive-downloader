import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSON5 from "json5";

export interface AlexaOverrideEntry {
  from: string;
  to: string;
  crawlerHostname?: string;
  crawlerIpAddress?: string;
  protocol?: string;
  headers?: string[][];
}

type AlexaOverridesFile = Record<string, AlexaOverrideEntry[]>;

const dataFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/enrichment/crawler-overrides_alexa.json",
);

let cache: AlexaOverridesFile | undefined;

function load(): AlexaOverridesFile {
  if (cache) {
    return cache;
  }
  cache = JSON5.parse<AlexaOverridesFile>(fs.readFileSync(dataFile, "utf-8"));
  return cache;
}

/**
 * Returns undefined if the crawler name is not present in the overrides file (fall through
 * to normal lookup). Returns an array (possibly empty) if the crawler IS in the file — the
 * caller should use the override data exclusively regardless of whether any entries matched
 * the timestamp.
 */
export function lookupAlexaOverride(
  crawlerName: string,
  timestamp: string,
): AlexaOverrideEntry[] | undefined {
  const overrides = load();
  const entries = overrides[crawlerName.toLowerCase()];
  if (!entries) {
    return undefined;
  }
  return entries.filter((e) => timestamp >= e.from && timestamp <= e.to);
}
