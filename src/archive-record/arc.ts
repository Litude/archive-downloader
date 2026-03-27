import { DateTime } from "luxon";
import { parseArchiveRecordHeadersToPairs, RawHeader } from "../utils/raw-header-parser.js";
import { dechunkChunkedResponse } from "./dechunk.js";

export interface ArcParsingOptions {
  metadataPrefix?: string;
  contentLengthIncludesTrailingNewline?: boolean;
}

export function parseArcFile(
  buffer: Buffer,
  parsingOptions?: ArcParsingOptions,
): {
  url: string;
  ip: string;
  status: number;
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
  const [url, ip, timestamp, _mimetype, lengthStr] = header.split(" ");
  let length = parseInt(lengthStr, 10);
  if (isNaN(length)) {
    throw new Error("Invalid ARC file: length is not a number");
  }

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
  const [protocol, statusCodeStr, ..._statusMessageParts] = statusLine.split(" ");
  const statusCode = parseInt(statusCodeStr, 10);
  if (isNaN(statusCode)) {
    throw new Error("Invalid ARC file: status code is not a number");
  }

  const parsedHeaders = parseArchiveRecordHeadersToPairs(httpHeaderLines.slice(1));

  const isChunked = parsedHeaders.some(
    ([name, value]) =>
      name.toLowerCase() === "transfer-encoding" && value.toLowerCase() === "chunked",
  );
  if (isChunked) {
    payloadBuffer = dechunkChunkedResponse(payloadBuffer);
  }

  const metadataPrefix = parsingOptions?.metadataPrefix;

  return {
    url,
    ip,
    status: statusCode,
    protocol,
    timestamp:
      DateTime.fromFormat(timestamp, "yyyyLLddHHmmss", { zone: "utc" }).toISO({
        suppressMilliseconds: true,
      }) || timestamp,
    metadata: metadataPrefix
      ? parsedHeaders.filter(([name]) => name.startsWith(metadataPrefix))
      : [],
    content: payloadBuffer,
    headers: metadataPrefix
      ? parsedHeaders.filter(([name]) => !name.startsWith(metadataPrefix))
      : parsedHeaders,
  };
}
