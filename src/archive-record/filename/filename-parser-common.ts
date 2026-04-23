export interface ParsedRecordFilename<T> {
  confidence: number;
  filenameType: string;
  recordFormat: "warc" | "arc";
  details: T;
}

export function removeFileExtensionFromArchiveFilename(part: string): string {
  let fixed = part;
  if (fixed.toLowerCase().endsWith(".gz")) {
    fixed = fixed.slice(0, -3);
  }
  if (fixed.toLowerCase().endsWith(".zst")) {
    fixed = fixed.slice(0, -4);
  }
  if (fixed.toLowerCase().endsWith(".arc")) {
    fixed = fixed.slice(0, -4);
  }
  if (fixed.toLowerCase().endsWith(".warc")) {
    fixed = fixed.slice(0, -5);
  }
  return fixed;
}

export function parseRecordFormatFromArchiveFilename(filename: string): "warc" | "arc" {
  let normalized = filename.toLowerCase();
  if (normalized.endsWith(".gz")) {
    normalized = normalized.slice(0, -3);
  }
  if (normalized.endsWith(".zst")) {
    normalized = normalized.slice(0, -4);
  }
  if (normalized.endsWith(".warc")) {
    return "warc";
  } else if (normalized.endsWith(".arc")) {
    return "arc";
  } else {
    throw new Error(`Unknown record format for filename: ${filename}`);
  }
}
