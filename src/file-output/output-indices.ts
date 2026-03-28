import { CaptureEntry } from "../types/capture-types.js";

export function assignCaptureIndices(captureEntries: CaptureEntry[]): void {
  const encounteredFilenames = new Set<string>();
  captureEntries = captureEntries.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));
  captureEntries.forEach((entry) => {
    const timestamp = entry.timestamp;
    let outputFilename = `${timestamp}`;
    let counter = 0;
    while (encounteredFilenames.has(outputFilename)) {
      counter++;
      outputFilename = `${timestamp}_${counter}`;
    }
    encounteredFilenames.add(outputFilename);
    entry.captureIndex = counter;
  });
}

export function assignContentIndices(captureEntries: CaptureEntry[]): void {
  const uniqueEntries = new Map<string, CaptureEntry>();
  const shaHasModified = new Set<string>();
  captureEntries = captureEntries.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));

  // First pass: identify which sha256 have modified timestamps
  captureEntries.forEach((entry) => {
    if (entry.lastModified && entry.sha256 && entry.classification.type === "ok") {
      shaHasModified.add(entry.sha256);
    }
  });

  // Second pass: collect unique entries, skipping no-modify ones if a modified exists
  captureEntries.forEach((entry) => {
    if (
      (!entry.lastModified && entry.sha256 && shaHasModified.has(entry.sha256)) ||
      entry.classification.type !== "ok"
    ) {
      return; // skip this entry
    }
    const key = `${entry.sha256}-${entry.lastModified ? entry.lastModified.toISO() : "no-modified"}`;
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, entry);
    }
  });

  const encounteredFilenames = new Set<string>();
  const outputIndexMap = new Map<string, number>();

  uniqueEntries.forEach((entry, key) => {
    const filenameTimestamp = entry.lastModified ?? entry.captureTimestamp;
    const timestamp = filenameTimestamp.toFormat("yyyyLLddHHmmss");

    let outputFilename = `${timestamp}`;
    let counter = 0;
    while (encounteredFilenames.has(outputFilename)) {
      counter++;
      outputFilename = `${timestamp}_${counter}`;
    }
    encounteredFilenames.add(outputFilename);
    outputIndexMap.set(key, counter);
  });

  captureEntries.forEach((entry) => {
    const key = `${entry.sha256}-${entry.lastModified ? entry.lastModified.toISO() : "no-modified"}`;
    if (outputIndexMap.has(key)) {
      entry.contentIndex = outputIndexMap.get(key);
    } else {
      entry.contentIndex = null;
    }
  });
}
