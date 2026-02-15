import path from "path";
import fs from "fs";
import { CaptureEntry } from "../types/capture-types";
import { Filename } from "../types/download-input-types";
import { filenameToString } from "../file-name/file-name";

const ARCHIVED_COMMON_HEADERS = ['content-type', 'content-length', 'location'];
const ARCHIVED_WAYBACK_HEADERS = ['memento-datetime', 'x-archive-src'];
const WAYBACK_ORIGINAL_HEADER_PREFIX = 'x-archive-orig-';

const ALL_HEADERS_TO_STORE = [
    ...ARCHIVED_COMMON_HEADERS,
    ...ARCHIVED_WAYBACK_HEADERS
];

function cleanupHeaders(headers: Record<string, string>): Record<string, string> {
    const cleanedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value && (ALL_HEADERS_TO_STORE.includes(key.toLowerCase()) || key.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX))) {
            cleanedHeaders[key] = value;
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
                headers: cleanupHeaders(headers)
            };
            fs.writeFileSync(headersPath, JSON.stringify(headerData, null, 2));
        }
    });
}
