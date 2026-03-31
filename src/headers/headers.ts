import { RawHeader } from "./raw-header-parser.js";

const POTENTIAL_UNCOMPRESSED_LENGTH_HEADERS = [
  "ntcoent-length",
  "x-uncompressed-content-length",
  "x-original-content-length",
  "x-decompressed-content-length",
  "cteonnt-Length",
];

export function getHeaderValue(
  headers: RawHeader[] | undefined,
  headerName: string,
): string | undefined {
  const header = headers?.find(([key]) => key.toLowerCase() === headerName.toLowerCase());
  return header ? header[1] : undefined;
}

export function getContentLengthHeader(headers: RawHeader[] | undefined): number | undefined {
  const contentLengthHeader = getHeaderValue(headers, "content-length");

  const numeric = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;
  if (numeric !== undefined && !isNaN(numeric)) {
    return numeric;
  }
  return undefined;
}

export function getUncompressedContentLength(headers: RawHeader[] | undefined): number | undefined {
  const contentEncoding = getHeaderValue(headers, "content-encoding");
  if (contentEncoding === "gzip") {
    for (const headerName of POTENTIAL_UNCOMPRESSED_LENGTH_HEADERS) {
      const uncompressedLengthHeader = getHeaderValue(headers, headerName);
      const numeric = uncompressedLengthHeader ? parseInt(uncompressedLengthHeader, 10) : undefined;
      if (numeric !== undefined && !isNaN(numeric)) {
        return numeric;
      }
    }
    return undefined;
  }
  return getContentLengthHeader(headers);
}
