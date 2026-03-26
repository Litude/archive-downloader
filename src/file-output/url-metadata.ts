import fs from "fs";
import path from "path";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";

export function writeUrlMetadata(metadata: Record<string, any>, filename: Filename, outputDirectory: string) {
  if (Object.values(metadata).every(value => value === undefined)) {
    return;
  }

  const archivalDir = path.join(outputDirectory, ".archivaldata");
  if (!fs.existsSync(archivalDir)) {
    fs.mkdirSync(archivalDir, { recursive: true });
  }
  const urlMetadataPath = path.join(archivalDir, `${filenameToString(filename, "simple")}.metadata.json`);
  try {
    fs.writeFileSync(urlMetadataPath, JSON.stringify(metadata, null, 2));
    console.log(`URL metadata written to ${urlMetadataPath}`);
  } catch (error) {
    console.error(`Failed to write URL metadata: ${error}`);
  }
}
