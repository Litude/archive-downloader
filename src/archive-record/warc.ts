import { parseArchiveRecordHeadersToPairs, RawHeader } from "../utils/raw-header-parser";
import { dechunkChunkedResponse } from "./dechunk";

export function parseWarcFile(buffer: Buffer): {
    url: string;
    ip: string;
    status: number;
    protocol: string;
    timestamp: string;
    metadata: RawHeader[];
    content: Buffer;
    headers: RawHeader[];
} {
    const content = buffer.toString('latin1');

    const warcHeaderEnd = content.indexOf('\r\n\r\n');
    if (warcHeaderEnd === -1) {
        throw new Error('Invalid WARC file: missing WARC header block');
    }

    const warcHeaderLines = content.slice(0, warcHeaderEnd).split('\r\n');
    if (!warcHeaderLines[0].startsWith('WARC/')) {
        throw new Error('Invalid WARC file: missing WARC version line');
    }

    const warcHeaders = parseArchiveRecordHeadersToPairs(warcHeaderLines.slice(1));

    const getWarcHeader = (name: string): string => {
        const header = warcHeaders.find(([n]) => n.toLowerCase() === name.toLowerCase());
        return header ? header[1] : '';
    };

    const url = getWarcHeader('WARC-Target-URI').replace(/^<|>$/g, '');
    const ip = getWarcHeader('WARC-IP-Address');
    const timestamp = getWarcHeader('WARC-Date');

    const contentLengthStr = getWarcHeader('Content-Length');
    const contentLength = parseInt(contentLengthStr, 10);
    if (isNaN(contentLength)) {
        throw new Error('Invalid WARC file: Content-Length is not a number');
    }

    const httpBlockStart = warcHeaderEnd + 4;
    const httpBlock = buffer.subarray(httpBlockStart, httpBlockStart + contentLength);

    const httpHeaderEnd = httpBlock.indexOf('\r\n\r\n');
    if (httpHeaderEnd === -1) {
        throw new Error('Invalid WARC file: missing HTTP headers in content block');
    }

    const httpHeaderLines = httpBlock.subarray(0, httpHeaderEnd).toString('latin1').split('\r\n');
    const statusLine = httpHeaderLines[0];
    const [protocol, statusCodeStr, ...statusMessageParts] = statusLine.split(' ');
    const statusCode = parseInt(statusCodeStr, 10);
    if (isNaN(statusCode)) {
        throw new Error('Invalid WARC file: status code is not a number');
    }

    const httpHeaders = parseArchiveRecordHeadersToPairs(httpHeaderLines.slice(1));
    let payloadBuffer = httpBlock.subarray(httpHeaderEnd + 4);

    const isChunked = httpHeaders.some(([name, value]) => name.toLowerCase() === 'transfer-encoding' && value.toLowerCase() === 'chunked');
    if (isChunked) {
        payloadBuffer = dechunkChunkedResponse(payloadBuffer);
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
