import { filenameToString } from "../file-name/file-name.js";
import { CaptureEntry } from "../types/capture-types.js";
import { Filename } from "../types/download-input-types.js";

export function assignOutputIndices(captureEntries: CaptureEntry[], filename: Filename): void {
  assignCaptureIndices(captureEntries, filename);
  assignContentIndices(captureEntries, filename);
}

function assignCaptureIndices(captureEntries: CaptureEntry[], filename: Filename): void {
  const headerFilename = structuredClone(filename);
  const encounteredFilenames = new Set<string>();
  captureEntries.forEach(entry => {
    const entryFilename = structuredClone(headerFilename);
    if (entry.classification.type !== "ok") {
      entryFilename.flags = "invalid";
    }
    entryFilename.timestamp = entry.captureTimestamp.toFormat("yyyyLLddHHmmss");
    let outputFilename = filenameToString(entryFilename, "full");
    let counter = 0;
    while (encounteredFilenames.has(outputFilename)) {
      counter++;
      outputFilename = filenameToString(entryFilename, "full", counter);
    }
    encounteredFilenames.add(outputFilename);
    entry.captureIndex = counter;
  });
}

function assignContentIndices(captureEntries: CaptureEntry[], filename: Filename): void {
  const uniqueEntries = new Map<string, CaptureEntry>();
  const shaHasModified = new Set<string>();

  // First pass: identify which sha256 have modified timestamps
  captureEntries.forEach(entry => {
    if (entry.lastModified && entry.sha256) {
      shaHasModified.add(entry.sha256);
    }
  });

  // Second pass: collect unique entries, skipping no-modify ones if a modified exists
  captureEntries.forEach(entry => {
    if (!entry.lastModified && entry.sha256 && shaHasModified.has(entry.sha256)) {
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
    const entryFilename = structuredClone(filename);
    const entryIsValid = entry.classification.type === "ok";

    if (!entryIsValid) {
      entryFilename.flags = "invalid";
    }

    const filenameTimestamp = entryIsValid ? (entry.lastModified ?? entry.captureTimestamp) : entry.captureTimestamp;
    entryFilename.timestamp = filenameTimestamp.toFormat("yyyyLLddHHmmss");

    let outputFilename = filenameToString(entryFilename, "full");

    // Ensure uniqueness (this should not really happen so the filenames will look ugly)
    let counter = 0;
    while (encounteredFilenames.has(outputFilename)) {
      counter++;
      outputFilename = filenameToString(entryFilename, "full", counter);
    }
    encounteredFilenames.add(outputFilename);
    outputIndexMap.set(key, counter);
  });

  captureEntries.forEach(entry => {
    const key = `${entry.sha256}-${entry.lastModified ? entry.lastModified.toISO() : "no-modified"}`;
    if (outputIndexMap.has(key)) {
      entry.contentIndex = outputIndexMap.get(key);
    }
    else {
      entry.contentIndex = null;
    }
  });
}
