import path from "path";
import fs from "fs";
import { CaptureEntry } from "../types/capture-types";
import { Filename } from "../types/download-input-types";
import { filenameToString } from "../file-name/file-name";

const ARCHIVED_COMMON_HEADERS = ['content-type', 'content-length', 'location', 'content-disposition'];
const ARCHIVED_WAYBACK_HEADERS = ['memento-datetime', 'x-archive-src'];
const WAYBACK_ORIGINAL_HEADER_PREFIX = 'x-archive-orig-';

const ALL_HEADERS_TO_STORE = [
    ...ARCHIVED_COMMON_HEADERS,
    ...ARCHIVED_WAYBACK_HEADERS
];

function urlOriginWithPort(url: URL): string {
    let origin = url.origin;
    // Origin includes port if it is non-default (i.e. not 80 for http or 443 for https)
    if (url.port) {
        return origin;
    }
    if (origin.startsWith('http://')) {
        return `${origin}:80`;
    } else if (origin.startsWith('https://')) {
        return `${origin}:443`;
    }
    return origin;
}

function cleanupLocationHeader(url: string, location: string): string {
    const isAbsolute = location.startsWith('http://') || location.startsWith('https://');
    if (isAbsolute) {
        const cleaned = location.replace(/^https?:\/\/web\.archive\.org\/web\/\d+[^\/]*\//, '');
        return cleaned;
    }
    // Relative URL
    else {
        const urlObj = new URL(url);
        let cleaned = location.replace(/^\/web\/\d+[^\/]*\//, '');
        const originWithPort = urlOriginWithPort(urlObj);
        if (cleaned.startsWith(originWithPort)) {
            cleaned = cleaned.substring(originWithPort.length);
        } else if (cleaned.startsWith(urlObj.origin)) {
            cleaned = cleaned.substring(urlObj.origin.length);
        }
        return cleaned;
    }

}

export function cleanupHeaders(url: string, headers: Record<string, string>): Record<string, string> {
    const cleanedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value && (ALL_HEADERS_TO_STORE.includes(key.toLowerCase()) || key.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX))) {
            cleanedHeaders[key] = key.toLowerCase() === 'location' ? cleanupLocationHeader(url, value) : value;
        }
    }
    return cleanedHeaders;
}

export function writeFileHeaders(captureEntries: CaptureEntry[], filename: Filename, outputDirectory: string) {
    const headerFilename = structuredClone(filename);
    const archivalDir = path.join(outputDirectory, '.archivaldata');
    fs.mkdirSync(archivalDir, { recursive: true });

    const encounteredFilenames = new Set<string>();
    captureEntries.forEach(entry => {
        const headers = entry.headers;
        if (headers) {
            const entryFilename = structuredClone(headerFilename);
            if (entry.classification !== "ok") {
                entryFilename.flags = "invalid";
            }
            entryFilename.timestamp = entry.captureTimestamp.toFormat('yyyyLLddHHmmss');
            let outputFilename = filenameToString(entryFilename, 'full');
            let counter = 1;
            while (encounteredFilenames.has(outputFilename)) {
                outputFilename = filenameToString(entryFilename, 'full', counter);
                counter++;
            }
            encounteredFilenames.add(outputFilename);
            const headersPath = path.join(archivalDir, `${outputFilename}.headers.json`);        
            const headerData = {
                url: entry.url,
                timestamp: entry.captureTimestamp.toISO(),
                status: +entry.statusCode,
                headers: cleanupHeaders(entry.url, headers),
            };
            fs.writeFileSync(headersPath, JSON.stringify(headerData, null, 2));
            const mtime = new Date(entry.captureTimestamp.toJSDate());
            fs.utimesSync(headersPath, mtime, mtime);
        }
    });
}
