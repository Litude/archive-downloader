import { DateTime } from "luxon";
import { parseArchiveRecordHeadersToPairs, RawHeader } from "../headers/raw-header-parser.js";
import { extractRecordContent } from "./record-content-extract.js";

export interface ArcParsingOptions {
  metadataPrefixes?: string[];
  contentLengthIncludesTrailingNewline?: boolean;
  alreadyDechunked?: boolean; // If true, will not attempt to dechunk even if Transfer-Encoding: chunked is present. Used for Arc files where the content is not actually chunked, but still has the header for some reason.
}

function parseArcHeaderLine(headerLine: string): {
  url: string;
  ip: string;
  timestamp: string;
  mimetype: string;
  length: number;
} {
  const parts = headerLine.split(" ");
  if (parts.length === 5) {
    // Arc v1
    const [url, ip, timestamp, mimetype, lengthStr] = parts;
    const length = parseInt(lengthStr, 10);
    if (isNaN(length)) {
      throw new Error("Invalid ARC file: length is not a number");
    }
    return { url, ip, timestamp, mimetype, length };
  } else if (parts.length === 10) {
    // Arc v2
    const [
      url,
      ip,
      timestamp,
      mimetype,
      _statusCode,
      _checksum,
      _location,
      _offset,
      _filename,
      lengthStr,
    ] = parts;
    const length = parseInt(lengthStr, 10);
    if (isNaN(length)) {
      throw new Error("Invalid ARC file: length is not a number");
    }
    return { url, ip, timestamp, mimetype, length };
  } else {
    throw new Error(`Invalid ARC file: header has ${parts.length} parts (expected 5 or 10)`);
  }
}

export function parseArcFile(
  buffer: Buffer,
  parsingOptions?: ArcParsingOptions,
): {
  url: string;
  ip: string;
  status: number;
  statusMessage: string;
  protocol: string;
  timestamp: string;
  metadata: RawHeader[];
  content: Buffer;
  headers: RawHeader[];
} {
  const content = buffer.toString("latin1");
  const headerEnd = content.indexOf("\n");
  if (headerEnd === -1) {
    throw new Error("Invalid ARC file: missing header");
  }

  const header = content.slice(0, headerEnd).trim();

  const { url, ip, timestamp, length: lengthRaw } = parseArcHeaderLine(header);
  let length = lengthRaw;

  if (parsingOptions?.contentLengthIncludesTrailingNewline) {
    length -= 1;
  }

  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + length;
  if (contentEnd > buffer.length) {
    throw new Error("Invalid ARC file: content length exceeds buffer size");
  }

  const contentBuffer = buffer.subarray(contentStart, contentEnd);

  const headerEndInContent = contentBuffer.indexOf("\r\n\r\n");
  if (headerEndInContent === -1) {
    throw new Error("Invalid ARC file: missing HTTP headers");
  }
  let payloadBuffer = contentBuffer.subarray(headerEndInContent + 4);

  const httpHeader = contentBuffer.subarray(0, headerEndInContent).toString("latin1");
  const httpHeaderLines = httpHeader.split("\r\n");
  const statusLine = httpHeaderLines[0];
  const [protocol, statusCodeStr, ...statusMessageParts] = statusLine.split(" ");
  const statusCode = parseInt(statusCodeStr, 10);
  if (isNaN(statusCode)) {
    throw new Error("Invalid ARC file: status code is not a number");
  }
  const statusMessage = statusMessageParts.join(" ");

  const parsedHeaders = parseArchiveRecordHeadersToPairs(httpHeaderLines.slice(1));
  payloadBuffer = extractRecordContent(payloadBuffer, parsedHeaders, {
    alreadyDechunked: parsingOptions?.alreadyDechunked,
  });

  const metadataPrefixes = parsingOptions?.metadataPrefixes;

  return {
    url,
    ip,
    status: statusCode,
    statusMessage,
    protocol,
    timestamp:
      DateTime.fromFormat(timestamp, "yyyyLLddHHmmss", { zone: "utc" }).toISO({
        suppressMilliseconds: true,
      }) || timestamp,
    metadata: metadataPrefixes
      ? parsedHeaders.filter(([name]) => metadataPrefixes.some((prefix) => name.startsWith(prefix)))
      : [],
    content: payloadBuffer,
    headers: metadataPrefixes
      ? parsedHeaders.filter(
          ([name]) => !metadataPrefixes.some((prefix) => name.startsWith(prefix)),
        )
      : parsedHeaders,
  };
}
