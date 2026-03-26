import fs from "fs";
import { Filename } from "../types/download-input-types.js";
import path from "path";
import { filenameToString } from "../file-name/file-name.js";

export function writeUnavailablePlaceholder(baseName: Filename, outputDirectory: string) {
  const outname = structuredClone(baseName);
  outname.flags = "unavailable";
  fs.mkdirSync(outputDirectory, { recursive: true });
  const finalName = filenameToString(outname, "full");
  const outpath = path.join(outputDirectory, `${finalName}.meta`);
  const fh = fs.openSync(outpath, "w");
  fs.closeSync(fh);
}
