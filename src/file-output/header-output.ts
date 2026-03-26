import { filenameToString } from "../file-name/file-name.js";
import { Filename } from "../types/download-input-types.js";
import { isIisDefaultMimetype } from "../utils/iis-mimetypes.js";
import { RawHeader } from "../utils/raw-header-parser.js";

const ARCHIVED_COMMON_HEADERS = [
  "content-type",
  "location",
  "content-location",
  "content-base",
  "content-disposition",
];
const WAYBACK_ORIGINAL_HEADER_PREFIX = "x-archive-orig-";
const COMMONCRAWL_ADDED_HEADER = "x-archive-orig-x_commoncrawl_";
const ADDRESS_HEADERS = ["location", "content-location", "content-base"];

const IisServerHeaderNames: Record<string, string> = {
  etag: "ETag",
  vtag: "VTag",
  p3p: "P3P",
  microsoftofficewebserver: "MicrosoftOfficeWebServer",
  "x-aspnet-version": "X-AspNet-Version",
  "ntcoent-length": "ntCoent-Length",
  "www-authenticate": "WWW-Authenticate",
  "x-ccc": "X-CCC",
  "x-cid": "X-CID",
};

function getFixedHeaderName(header: string, server?: string): string {
  if (
    server &&
    (server.toLowerCase().startsWith("microsoft-iis") || server.toLowerCase().startsWith("apache"))
  ) {
    const fixedName = IisServerHeaderNames[header.toLowerCase()];
    if (!fixedName) {
      const parts = header.toLowerCase().split("-");
      parts.forEach((part, index) => {
        parts[index] = part.charAt(0).toUpperCase() + part.slice(1);
      });
      return parts.join("-");
    } else {
      return fixedName;
    }
  } else {
    return header;
  }
}

function isOriginalCaptureHeader(header: string): boolean {
  return (
    header.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX) &&
    !header.toLowerCase().startsWith(COMMONCRAWL_ADDED_HEADER)
  );
}

function urlOriginWithPort(url: URL): string {
  const origin = url.origin;
  // Origin includes port if it is non-default (i.e. not 80 for http or 443 for https)
  if (url.port) {
    return origin;
  }
  if (origin.startsWith("http://")) {
    return `${origin}:80`;
  } else if (origin.startsWith("https://")) {
    return `${origin}:443`;
  }
  return origin;
}

function cleanupUrlHeader(url: string, location: string): string {
  const isAbsolute = location.startsWith("http://") || location.startsWith("https://");
  if (isAbsolute) {
    const cleaned = location.replace(/^https?:\/\/web\.archive\.org\/web\/\d+[^/]*\//, "");
    return cleaned;
  }
  // Relative URL
  else {
    const urlObj = new URL(url);
    let cleaned = location.replace(/^\/web\/\d+[^/]*\//, "");
    const originWithPort = urlOriginWithPort(urlObj);
    if (cleaned.startsWith(originWithPort)) {
      cleaned = cleaned.substring(originWithPort.length);
    } else if (cleaned.startsWith(urlObj.origin)) {
      cleaned = cleaned.substring(urlObj.origin.length);
    }
    return cleaned;
  }
}

export function cleanupWaybackHeaders(
  url: string,
  headers: Record<string, string>,
  rawHeaders: RawHeader[],
  filename: Filename,
): {
  original?: RawHeader[];
  reconstructed?: RawHeader[];
} {
  const originalHeaders: RawHeader[] = [];
  const reconstructedHeaders: RawHeader[] = [];
  const encounteredOriginalKeys = new Set<string>();
  const server = headers["x-archive-orig-server"];

  for (const [key, value] of rawHeaders) {
    if (isOriginalCaptureHeader(key)) {
      const originalKey = key.substring(WAYBACK_ORIGINAL_HEADER_PREFIX.length);
      encounteredOriginalKeys.add(originalKey.toLowerCase());
      const fixedOriginalKey = getFixedHeaderName(originalKey, server);
      originalHeaders.push([fixedOriginalKey, value]);
    }
    // Wayback seems to return content-encoding unmodified as long as the request is without gzip encoding
    else if (
      key.toLowerCase() === "content-encoding" &&
      !rawHeaders.some(
        ([k]) => k.toLowerCase() === `${WAYBACK_ORIGINAL_HEADER_PREFIX}content-encoding`,
      )
    ) {
      const fixedOriginalKey = getFixedHeaderName("content-encoding", server);
      encounteredOriginalKeys.add("content-encoding");
      originalHeaders.push([fixedOriginalKey, value]);
    }
    // wayback does content-type rewriting but the exact logic is not open source...
    else if (
      key.toLowerCase() === "content-type" &&
      !rawHeaders.some(([k]) => k.toLowerCase() === `${WAYBACK_ORIGINAL_HEADER_PREFIX}content-type`)
    ) {
      const fixedOriginalKey = getFixedHeaderName("content-type", server);
      if (value.includes(";") || isIisDefaultMimetype(filenameToString(filename), value, server)) {
        encounteredOriginalKeys.add("content-type");
        originalHeaders.push([fixedOriginalKey, value]);
      }
    }
  }

  for (const [key, value] of rawHeaders) {
    const lowerKey = key.toLowerCase();
    const fixedKey = getFixedHeaderName(lowerKey, server);
    if (ARCHIVED_COMMON_HEADERS.includes(lowerKey) && !encounteredOriginalKeys.has(lowerKey)) {
      reconstructedHeaders.push([
        fixedKey,
        ADDRESS_HEADERS.includes(lowerKey) ? cleanupUrlHeader(url, value) : value,
      ]);
    }
  }

  return {
    original: originalHeaders.length ? originalHeaders : undefined,
    reconstructed: reconstructedHeaders.length ? reconstructedHeaders : undefined,
  };
}
