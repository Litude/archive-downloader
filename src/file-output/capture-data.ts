import path, { parse } from "path";
import fs from "fs";
import { CaptureEntry } from "../types/capture-types";
import { Filename } from "../types/download-input-types";
import { filenameToString } from "../file-name/file-name";
import { getMostLikelyEtagDate, parseIisEtagDate } from "../utils/iis-etag-parser";
import { DateTime } from "luxon";
import { logWarning } from "../utils/log-context";
import { cleanupWaybackHeaders } from "./header-output";

// const ARCHIVED_COMMON_HEADERS = ['content-type', 'content-length', 'location', 'content-location', 'content-base', 'content-disposition'];
// const ARCHIVED_WAYBACK_HEADERS = ['memento-datetime', 'x-archive-src'];
// const WAYBACK_ORIGINAL_HEADER_PREFIX = 'x-archive-orig-';
// const COMMONCRAWL_ADDED_HEADER = 'x-archive-orig-x_commoncrawl_';

// const ALL_HEADERS_TO_STORE = [
//     ...ARCHIVED_COMMON_HEADERS,
//     ...ARCHIVED_WAYBACK_HEADERS
// ];

// const ADDRESS_HEADERS = ['location', 'content-location', 'content-base'];

// function isOriginalCaptureHeader(header: string): boolean {
//     return header.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX) && !header.toLowerCase().startsWith(COMMONCRAWL_ADDED_HEADER);
// }

// function urlOriginWithPort(url: URL): string {
//     let origin = url.origin;
//     // Origin includes port if it is non-default (i.e. not 80 for http or 443 for https)
//     if (url.port) {
//         return origin;
//     }
//     if (origin.startsWith('http://')) {
//         return `${origin}:80`;
//     } else if (origin.startsWith('https://')) {
//         return `${origin}:443`;
//     }
//     return origin;
// }

// function cleanupUrlHeader(url: string, location: string): string {
//     const isAbsolute = location.startsWith('http://') || location.startsWith('https://');
//     if (isAbsolute) {
//         const cleaned = location.replace(/^https?:\/\/web\.archive\.org\/web\/\d+[^\/]*\//, '');
//         return cleaned;
//     }
//     // Relative URL
//     else {
//         const urlObj = new URL(url);
//         let cleaned = location.replace(/^\/web\/\d+[^\/]*\//, '');
//         const originWithPort = urlOriginWithPort(urlObj);
//         if (cleaned.startsWith(originWithPort)) {
//             cleaned = cleaned.substring(originWithPort.length);
//         } else if (cleaned.startsWith(urlObj.origin)) {
//             cleaned = cleaned.substring(urlObj.origin.length);
//         }
//         return cleaned;
//     }

// }

// export function cleanupHeaders(url: string, headers: Record<string, string>): Record<string, string> {
//     const cleanedHeaders: Record<string, string> = {};
//     for (const [key, value] of Object.entries(headers)) {
//         if (value && (ALL_HEADERS_TO_STORE.includes(key.toLowerCase()) || isOriginalCaptureHeader(key))) {
//             cleanedHeaders[key] = ADDRESS_HEADERS.includes(key.toLowerCase()) ? cleanupUrlHeader(url, value) : value;
//         }
//     }
//     return cleanedHeaders;
// }

function getExactModificationDate(captureEntry: CaptureEntry): { modificationTimePrecise?: string, plausiblePreciseModificationDates?: string[] } | null {
    const likelyIisServer = captureEntry.headers?.['x-archive-orig-server']?.toLowerCase().includes('microsoft-iis');
    try {
        if (captureEntry.headers?.['x-archive-orig-etag'] && captureEntry.lastModified) {
            const etagDates = getMostLikelyEtagDate(
                captureEntry.headers['x-archive-orig-etag'],
                captureEntry.captureTimestamp,
                captureEntry.lastModified
            );
            if (etagDates) {
                if (etagDates.length === 1) {
                    return { modificationTimePrecise: etagDates[0] }
                }
                else if (etagDates.length > 1) {
                    if (etagDates[0].endsWith("0000000000Z")) {
                        return { modificationTimePrecise: etagDates[0], plausiblePreciseModificationDates: etagDates };
                    }
                    else {
                        logWarning(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but multiple plausible matches for exact modification date: ${etagDates.join(", ")}.`, "iis-etag-parser");
                        console.warn(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but multiple plausible matches for exact modification date: ${etagDates.join(", ")}.`);
                        return { plausiblePreciseModificationDates: etagDates };
                    }
                }
            }    
        }
        else if (captureEntry.headers?.['x-archive-orig-etag'] && likelyIisServer) {
            const etagDates = parseIisEtagDate(captureEntry.headers['x-archive-orig-etag'], captureEntry.captureTimestamp);
            if (etagDates) {
                if (etagDates.length === 1) {
                    logWarning(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found 1 plausible match.`, "iis-etag-parser");
                    return { modificationTimePrecise: etagDates[0] };
                }
                else if (etagDates.length > 1) {
                    if (etagDates[0].endsWith("0000000000Z")) {
                        logWarning(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`, "iis-etag-parser");
                        console.warn(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header. Found multiple plausible matches, one with apparent sub-second precision: ${etagDates.join(", ")}.`);
                        return { modificationTimePrecise: etagDates[0], plausiblePreciseModificationDates: etagDates };
                    }
                    else {
                        logWarning(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")} but unable to pick.`, "iis-etag-parser");
                        console.warn(`Capture ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}-${captureEntry.url} has ETag header but no last-modified header, multiple plausible dates found: ${etagDates.join(", ")}.`);
                        return { plausiblePreciseModificationDates: etagDates };
                    }
                }
            }
        }
        return null;     
    } catch (e) {
        if (likelyIisServer) {
            logWarning(`Parsing IIS ETag header for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true})} failed.`, "iis-etag-parser");
        }
        console.error(`Error parsing ETag for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO()}:`, e);
        return null;
    }
}

function getExactCaptureDate(captureEntry: CaptureEntry): string | null {
    const headers = captureEntry.headers;
    if (headers?.['x-archive-orig-x_commoncrawl_fetchtimestamp']) {
        const timestamp = +headers['x-archive-orig-x_commoncrawl_fetchtimestamp'];
        const date = new Date(timestamp);
        // It seems some captures have very apparent timezone issues and this header is **probably** actually the correct capture timestamp...
        if (date.valueOf() - captureEntry.captureTimestamp.toMillis() > 8 * 3600 * 1000) {
            logWarning(`Original capture timestamp from x_commoncrawl_fetchtimestamp differs by more than 8 hours from capture timestamp for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}. Ignoring value.`, "timestamp-sanity-check");
            console.warn(`Original capture timestamp from x_commoncrawl_fetchtimestamp differs by more than 8 hours from capture timestamp for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}. Ignoring value.`);
            return null;
        }
        else if (date.valueOf() - captureEntry.captureTimestamp.toMillis() > 1 * 3600 * 1000) {
            logWarning(`Original capture timestamp from x_commoncrawl_fetchtimestamp differs by more than 1 hour from capture timestamp for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}.`, "timestamp-sanity-check");
            console.warn(`Original capture timestamp from x_commoncrawl_fetchtimestamp differs by more than 1 hour from capture timestamp for ${captureEntry.url} captured at ${captureEntry.captureTimestamp.toISO({ suppressMilliseconds: true })}.`);
        }
        return DateTime.fromJSDate(date).toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'000000Z'");
    }
    return null;
}

function cleanupStatusString(status: string): number | null {
    if (!status || status === '-') {
        return null;
    }
    const parsed = parseInt(status);
    return isNaN(parsed) ? null : parsed;
}

export function writeCaptureData(captureEntries: CaptureEntry[], filename: Filename, outputDirectory: string) {
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

            const exactModificationDate = getExactModificationDate(entry);
            if (!exactModificationDate && entry.headers?.['x-archive-orig-etag']) {
                console.log(`Could not determine exact modification date for ${entry.url} captured at ${entry.captureTimestamp.toISO({ suppressMilliseconds: true })}`);
            }
            const exactCaptureDate = getExactCaptureDate(entry);
            
            const captureDataPath = path.join(archivalDir, `${outputFilename}.capture.json`);        
            const captureData = {
                url: entry.url,
                captureTime: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
                captureTimePrecise: exactCaptureDate ?? undefined,
                status: cleanupStatusString(entry.statusCode),
                modificationTime: entry.lastModified ? entry.lastModified.toISO({ suppressMilliseconds: true }) : undefined,
                modificationTimePrecise: exactModificationDate?.modificationTimePrecise ?? undefined,
                modificationTimePreciseCandidates: exactModificationDate?.plausiblePreciseModificationDates ?? undefined,
                headers: cleanupWaybackHeaders(entry.url, headers),
                captureData: {
                    source: entry.archiveSource,
                    sha256: entry.originalSha256 ?? entry.sha256,
                    actualDigest: entry.actualDigest,
                    classification: entry.classification,
                    classificationDetails: entry.metadata?.classificationDetails,
                    cdxEntry: {
                        urlkey: entry.cdxEntry.urlkey,
                        timestamp: entry.cdxEntry.timestamp,
                        url: entry.cdxEntry.url,
                        status: cleanupStatusString(entry.cdxEntry.status),
                        digest: entry.cdxEntry.digest ?? null,
                        mimetype: entry.cdxEntry.mimetype,
                        filename: entry.archiveFilename ?? entry.cdxEntry.filename ?? null,
                        offset: entry.cdxEntry.offset ?? null,
                        length: entry.cdxEntry.length ?? null,
                        revisitEntry: entry.cdxEntry.revisitEntry ? {
                            urlkey: entry.cdxEntry.revisitEntry.urlkey,
                            timestamp: entry.cdxEntry.revisitEntry.timestamp,
                            url: entry.cdxEntry.revisitEntry.url,
                            status: cleanupStatusString(entry.cdxEntry.revisitEntry.status),
                            digest: entry.cdxEntry.revisitEntry.digest ?? null,
                            mimetype: entry.cdxEntry.revisitEntry.mimetype,
                            filename: entry.archiveFilename ?? entry.cdxEntry.revisitEntry.filename ?? null,
                            offset: entry.cdxEntry.revisitEntry.offset ?? null,
                            length: entry.cdxEntry.revisitEntry.length ?? null,
                        } : undefined
                    },
                    wayback: {
                        mementoDatetime: entry.headers?.['memento-datetime'] ?
                            DateTime.fromHTTP(entry.headers?.['memento-datetime']).setZone('UTC').toISO({ suppressMilliseconds: true })
                            :
                            undefined,
                        ...entry.metadata?.wayback
                    }
                }
                // TODO: Validation errors etc?
            };
            fs.writeFileSync(captureDataPath, JSON.stringify(captureData, null, 2));
            const mtime = new Date(entry.captureTimestamp.toJSDate());
            fs.utimesSync(captureDataPath, mtime, mtime);
        }
    });
}
