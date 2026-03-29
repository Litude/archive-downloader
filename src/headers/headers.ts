import { CaptureEntry } from "../types/capture-types.js";
import { RawHeader } from "./raw-header-parser.js";

export function getHeaderValue(headers: RawHeader[], headerName: string): string | undefined {
  const header = headers.find(([key]) => key.toLowerCase() === headerName.toLowerCase());
  return header ? header[1] : undefined;
}

export function getCaptureHeaderValue(
  captureEntry: CaptureEntry,
  headerName: string,
): string | undefined {
  const header = captureEntry.headerOutput?.find(
    (h) => h[0].toLowerCase() === headerName.toLowerCase(),
  );
  if (header) {
    return header[1];
  }
  return undefined;
}
