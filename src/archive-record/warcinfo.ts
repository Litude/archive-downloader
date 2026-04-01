import { parseArchiveRecordHeadersToPairs, RawHeader } from "../headers/raw-header-parser.js";

export function parseWarcinfoFile(buffer: Buffer): {
  timestamp: string;
  metadata: RawHeader[];
  lines: RawHeader[];
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

  const timestamp = getWarcHeader("WARC-Date");

  const contentLengthStr = getWarcHeader("Content-Length");
  const contentLength = parseInt(contentLengthStr, 10);
  if (isNaN(contentLength)) {
    throw new Error("Invalid WARC file: Content-Length is not a number");
  }

  const infoBlockStart = warcHeaderEnd + 4;
  const infoBlock = buffer.subarray(infoBlockStart);

  const infoBlockEnd = infoBlock.indexOf("\r\n\r\n");
  if (infoBlockEnd === -1) {
    throw new Error("Invalid WARC file: missing HTTP headers in content block");
  }

  const infoBlockLines = infoBlock.subarray(0, infoBlockEnd).toString("latin1").split("\r\n");

  const infoLines = parseArchiveRecordHeadersToPairs(infoBlockLines);

  return {
    timestamp,
    metadata: warcHeaders,
    lines: infoLines,
  };
}
