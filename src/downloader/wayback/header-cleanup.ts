import { filenameToString } from "../../file-name/file-name.js";
import { Filename } from "../../types/download-input-types.js";
import { isIisDefaultMimetype } from "../../utils/iis-mimetypes.js";
import { RawHeader, UNCONFIRMED_HEADER_MARKER } from "../../headers/raw-header-parser.js";
import { DateTime } from "luxon";

const WAYBACK_ORIGINAL_HEADER_PREFIX = "x-archive-orig-";
const COMMONCRAWL_ADDED_HEADER1 = "x-archive-orig-x_commoncrawl_";
const COMMONCRAWL_ADDED_HEADER2 = "x-archive-orig-x-commoncrawl-";
const ADDRESS_HEADERS = ["location", "content-location", "content-base"];

// Headers presumambly always returned unmodified by wayback and not prefixed with x-archive-orig
const UNMOFIDIED_HEADERS = ["content-encoding", "content-disposition"];

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

function headerToSentenceCase(header: string): string {
  const parts = header.toLowerCase().split("-");
  parts.forEach((part, index) => {
    parts[index] = part.charAt(0).toUpperCase() + part.slice(1);
  });
  return parts.join("-");
}

function getFixedHeaderName(header: string, server?: string, date?: string): string {
  if (
    server &&
    (server.toLowerCase().startsWith("microsoft-iis") || server.toLowerCase().startsWith("apache"))
  ) {
    const fixedName = IisServerHeaderNames[header.toLowerCase()];
    if (!fixedName) {
      return headerToSentenceCase(header);
    } else {
      return fixedName;
    }
  } else if (date) {
    // For captures before 2015, we assume headers were always in sentence case
    const datetime = DateTime.fromHTTP(date);
    if (datetime.year < 2015) {
      return headerToSentenceCase(header);
    }
  }
  return header;
}

function isOriginalCaptureHeader(header: string): boolean {
  return (
    header.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX) &&
    !header.toLowerCase().startsWith(COMMONCRAWL_ADDED_HEADER1) &&
    !header.toLowerCase().startsWith(COMMONCRAWL_ADDED_HEADER2)
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
  timestamp: DateTime,
): RawHeader[] {
  const headerOutput: RawHeader[] = [];
  const server: string | undefined = headers["x-archive-orig-server"];
  const date = timestamp.toHTTP() ?? undefined;

  for (const [key, value] of rawHeaders) {
    if (isOriginalCaptureHeader(key)) {
      const originalKey = key.substring(WAYBACK_ORIGINAL_HEADER_PREFIX.length);
      const fixedOriginalKey = getFixedHeaderName(originalKey, server, date);
      headerOutput.push([fixedOriginalKey, value]);
    } else if (
      key.toLowerCase() === "content-type" &&
      !rawHeaders.some(([k]) => k.toLowerCase() === `${WAYBACK_ORIGINAL_HEADER_PREFIX}content-type`)
    ) {
      const fixedOriginalKey = getFixedHeaderName("content-type", server, date);
      if (value.includes(";") || isIisDefaultMimetype(filenameToString(filename), value, server)) {
        headerOutput.push([fixedOriginalKey, value]);
      } else {
        headerOutput.push([fixedOriginalKey, value, UNCONFIRMED_HEADER_MARKER]);
      }
    } else if (
      UNMOFIDIED_HEADERS.includes(key.toLowerCase()) &&
      !rawHeaders.some(
        ([k]) => k.toLowerCase() === `${WAYBACK_ORIGINAL_HEADER_PREFIX}${key.toLowerCase()}`,
      )
    ) {
      const fixedOriginalKey = getFixedHeaderName(key, server, date);
      headerOutput.push([fixedOriginalKey, value]);
    } else if (
      ADDRESS_HEADERS.includes(key.toLowerCase()) &&
      !rawHeaders.some(
        ([k]) => k.toLowerCase() === `${WAYBACK_ORIGINAL_HEADER_PREFIX}${key.toLowerCase()}`,
      )
    ) {
      const fixedOriginalKey = getFixedHeaderName(key, server, date);
      const cleanedValue = cleanupUrlHeader(url, value);
      headerOutput.push([fixedOriginalKey, cleanedValue, UNCONFIRMED_HEADER_MARKER]);
    }
  }
  return headerOutput;
}
