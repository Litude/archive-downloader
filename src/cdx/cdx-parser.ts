import { CdxEntry } from "../types/wayback-types.js";

// Maps CDX field codes to CdxEntry property names.
// See https://iipc.github.io/warc-specifications/specifications/cdx-format/cdx-2015/
const CDX_FIELD_MAP: Partial<Record<string, keyof CdxEntry>> = {
  N: "urlkey",
  b: "timestamp",
  a: "url",
  m: "mimetype",
  s: "status",
  k: "digest",
  V: "offset",
  S: "length",
  g: "filename",
};

export function parseCdx(text: string, source: string): CdxEntry[] {
  const lines = text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new Error("CDX file is empty");
  }

  const headerLine = lines[0];
  if (!headerLine.startsWith(" CDX ")) {
    throw new Error(`CDX file has unexpected header: ${headerLine}`);
  }

  const fieldCodes = headerLine.slice(" CDX ".length).split(" ");
  const fieldNames = fieldCodes.map((code) => CDX_FIELD_MAP[code] ?? null);

  const entries: CdxEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(" ");
    const entry: Partial<CdxEntry> & { source: string } = { source };

    for (let j = 0; j < fieldNames.length; j++) {
      const field = fieldNames[j];
      if (field === null) {
        continue;
      }
      const value = parts[j];
      if (value === undefined || value === "-") {
        continue;
      }

      if (field === "offset" || field === "length" || field === "status") {
        entry[field] = parseInt(value, 10);
      } else {
        entry[field] = value;
      }
    }

    if (!entry.urlkey || !entry.timestamp || !entry.url || !entry.mimetype) {
      console.warn(`CDX line ${i + 1} is missing required fields, skipping: ${lines[i]}`);
      continue;
    }

    entries.push(entry as CdxEntry);
  }

  return entries;
}
