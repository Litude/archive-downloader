import { parseArchiveRecordHeadersToPairs, RawHeader } from "../utils/raw-header-parser.js";
import { dechunkChunkedResponse } from "./dechunk.js";

interface WarcParsingOptions {
  undoCommonCrawlHeaderNaming?: boolean;
  extraBlankLineAfterHeaders?: boolean; // CC-MAIN-2018-34 has an extra blank line after HTTP headers
}

export function parseWarcFile(
  buffer: Buffer,
  options?: WarcParsingOptions,
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

  const warcHeaderEnd = content.indexOf("\r\n\r\n");
  if (warcHeaderEnd === -1) {
    throw new Error("Invalid WARC file: missing WARC header block");
  }

  const warcHeaderLines = content.slice(0, warcHeaderEnd).split("\r\n");
  if (!warcHeaderLines[0].startsWith("WARC/")) {
    throw new Error("Invalid WARC file: missing WARC version line");
  }

  const warcHeaders = parseArchiveRecordHeadersToPairs(warcHeaderLines.slice(1));

  const getWarcHeader = (name: string): string => {
    const header = warcHeaders.find(([n]) => n.toLowerCase() === name.toLowerCase());
    return header ? header[1] : "";
  };

  const url = getWarcHeader("WARC-Target-URI").replace(/^<|>$/g, "");
  const ip = getWarcHeader("WARC-IP-Address");
  const timestamp = getWarcHeader("WARC-Date");

  const contentLengthStr = getWarcHeader("Content-Length");
  const contentLength = parseInt(contentLengthStr, 10);
  if (isNaN(contentLength)) {
    throw new Error("Invalid WARC file: Content-Length is not a number");
  }

  const httpBlockStart = warcHeaderEnd + 4;
  const httpBlock = buffer.subarray(httpBlockStart, httpBlockStart + contentLength);

  const httpHeaderEnd = httpBlock.indexOf("\r\n\r\n");
  if (httpHeaderEnd === -1) {
    throw new Error("Invalid WARC file: missing HTTP headers in content block");
  }

  const httpHeaderLines = httpBlock.subarray(0, httpHeaderEnd).toString("latin1").split("\r\n");
  const statusLine = httpHeaderLines[0];
  const [protocol, statusCodeStr, ..._statusMessageParts] = statusLine.split(" ");
  const statusCode = parseInt(statusCodeStr, 10);
  if (isNaN(statusCode)) {
    throw new Error("Invalid WARC file: status code is not a number");
  }

  const httpHeaders = parseArchiveRecordHeadersToPairs(httpHeaderLines.slice(1));
  const dividerSize = options?.extraBlankLineAfterHeaders ? 6 : 4;
  let payloadBuffer = httpBlock.subarray(httpHeaderEnd + dividerSize);

  const isChunked = httpHeaders.some(
    ([name, value]) =>
      name.toLowerCase() === "transfer-encoding" && value.toLowerCase() === "chunked",
  );
  if (isChunked) {
    payloadBuffer = dechunkChunkedResponse(payloadBuffer);
  }

  // Common crawl removes or replaces some headers, and the originals have the "X-Crawler-" prefix.
  // We need to undo this, and if a replacement header existed we move it to metadata instead
  if (options?.undoCommonCrawlHeaderNaming) {
    const crawlerPrefixLower = "x-crawler-";

    // Map originalNameLower -> index of the X-Crawler-* header
    const crawlerHeaderIndices = new Map<string, number>();
    for (let i = 0; i < httpHeaders.length; i++) {
      const nameLower = httpHeaders[i][0].toLowerCase();
      if (nameLower.startsWith(crawlerPrefixLower)) {
        crawlerHeaderIndices.set(nameLower.slice(crawlerPrefixLower.length), i);
      }
    }

    // Find replacement headers: non-X-Crawler- headers that have an X-Crawler- counterpart
    const replacementIndices: number[] = [];
    for (let i = 0; i < httpHeaders.length; i++) {
      const nameLower = httpHeaders[i][0].toLowerCase();
      if (!nameLower.startsWith(crawlerPrefixLower) && crawlerHeaderIndices.has(nameLower)) {
        replacementIndices.push(i);
      }
    }

    // Restore X-Crawler-* header names in place (preserves their position)
    for (const [, idx] of crawlerHeaderIndices) {
      const [name, value] = httpHeaders[idx];
      httpHeaders[idx] = [name.slice("X-Crawler-".length), value];
    }

    // Move replacement headers to metadata and remove them (back-to-front to keep indices valid)
    for (let i = replacementIndices.length - 1; i >= 0; i--) {
      const idx = replacementIndices[i];
      warcHeaders.push(
        httpHeaders[idx].map((v, j) => (j === 0 ? `X-Crawler-${v}` : v)) as RawHeader,
      );
      httpHeaders.splice(idx, 1);
    }
  }

  return {
    url,
    ip,
    status: statusCode,
    protocol,
    timestamp,
    metadata: warcHeaders,
    content: payloadBuffer,
    headers: httpHeaders,
  };
}
