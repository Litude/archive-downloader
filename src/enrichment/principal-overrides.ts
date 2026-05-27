import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSON5 from "json5";

export interface PrincipalOverrideEntry {
  from: string;
  to: string;
  protocol: string;
  headers: string[][];
}

type PrincipalOverridesFile = Record<string, PrincipalOverrideEntry[]>;

const dataFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/enrichment/principal_headers.json",
);

let cache: PrincipalOverridesFile | undefined;

function load(): PrincipalOverridesFile {
  if (cache) {
    return cache;
  }
  cache = JSON5.parse<PrincipalOverridesFile>(fs.readFileSync(dataFile, "utf-8"));
  return cache;
}

export function lookupPrincipalHeaders(crawlIdentifier: string, timestamp: string): PrincipalOverrideEntry | undefined {
  const overrides = load();
  const providers = Object.keys(overrides);
  const matchingProvider = providers.find((p) => crawlIdentifier.toLowerCase() === p.toLowerCase() || crawlIdentifier.toLowerCase().startsWith(`${p.toLowerCase()}-`));
  if (!matchingProvider) {
    return undefined;
  }

  const entries = overrides[matchingProvider];
  if (!entries) {
    return undefined;
  }
  return entries.find((e) => timestamp >= e.from && timestamp <= e.to);
}
