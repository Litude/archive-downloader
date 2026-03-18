import axios from "axios";
import zlib from "zlib";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF, WAYBACK_REQUEST_TIMEOUT } from "./wayback-common";
import { ArchiveRecord, CaptureEntry } from "../../types/capture-types";
import { parseCdx } from "../../cdx/cdx-parser";
import { CdxEntry } from "../../types/wayback-types";

const cachedAvailability: Record<string, boolean> = {};

const downloadUrlBase = 'https://archive.org/download/';

function generateDownloadUrl(filename: string): string {
    return `${downloadUrlBase}${filename}`;
}

async function internalCheckRecordAvailability(filename: string): Promise<boolean> {
    let attempt = 0;
    let backoff = WAYBACK_INITIAL_BACKOFF;
    const url = generateDownloadUrl(filename);
    const itemId = filename.split('/')[0];
    while (true) {
        try {
            console.log(`Fetching availability for item ${itemId} (attempt ${attempt})...`);
            const response = await axios.head(url, { validateStatus: () => true });
            if (response.status === 200) {
                return true;
            }
            // Seems to be completely random whether an unavailable record returns 403 or 401, so we treat both as unavailable(?)
            else if (response.status === 401 || response.status === 403) {
                return false;
            }
            else {
                throw new Error(`Unexpected status code ${response.status} for ${url}`);
            }
        } catch (error: any) {
            console.error(`Error checking availability for ${url} (${error.message}), retrying in ${backoff / 1000}s...`);
            // Wait a bit before retrying to avoid spamming the server
            await new Promise(resolve => setTimeout(resolve, backoff));
            backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
            attempt++;
        }
    }
}

export async function checkArchiveRecordPublicAvailability(filename: string): Promise<boolean> {
    // We assume that if one file is unavailable/available, then all files for that item are unavailable/available,
    // so we can cache the result by item ID to avoid making multiple requests for the same item.

    const itemId = filename.split('/')[0];
    if (cachedAvailability[itemId] !== undefined) {
        return cachedAvailability[itemId];
    }
    const available = await internalCheckRecordAvailability(filename);
    cachedAvailability[itemId] = available;
    return available;
}

async function fetchRecordArchiveCdx(cdxFilename: string, itemId: string) {
    const cdxUrl = generateDownloadUrl(cdxFilename);
    let attempt = 0;
    let backoff = WAYBACK_INITIAL_BACKOFF;
    while (true) {
        try {
            console.log(`Fetching CDX file for item ${itemId} (attempt ${attempt})...`);
            const response = await axios.get(cdxUrl, { responseType: 'arraybuffer', timeout: WAYBACK_REQUEST_TIMEOUT });
            const decompressed = zlib.gunzipSync(Buffer.from(response.data));
            const text = decompressed.toString('utf-8');
            return parseCdx(text, "wayback");
        } catch (error: any) {
            console.error(`Error fetching CDX file for ${cdxUrl} (${error.message}), retrying in ${backoff / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
            attempt++;
        }
    }
}


async function downloadCdx(cdxFilename: string, entryFilename: string, entry: CaptureEntry) {
    const itemId = entryFilename.split('/')[0];
    const cdxEntries = await fetchRecordArchiveCdx(cdxFilename, itemId);
    // Filter CDX entries to only those that match the capture timestamp and URL of the original entry, to avoid downloading unnecessary records
    const mainCdxEntry = entry.cdxEntry.revisitEntry ?? entry.cdxEntry;
    const matchingEntries = cdxEntries.filter(
        cdxEntry => cdxEntry.timestamp === mainCdxEntry.timestamp &&
            cdxEntry.url === mainCdxEntry.url &&
            cdxEntry.digest === mainCdxEntry.digest &&
            cdxEntry.length === mainCdxEntry.length &&
            cdxEntry.status === mainCdxEntry.status
    );
    if (matchingEntries.length === 0) {
        throw new Error(`No matching CDX entries found for ${cdxFilename} with timestamp ${entry.timestamp} and URL ${entry.url}?!`);
    }
    else if (matchingEntries.length > 1) {
        console.warn(`Multiple matching CDX entries found for ${cdxFilename} with timestamp ${entry.timestamp} and URL ${entry.url}! Picking first.`);
    }
    return matchingEntries[0];
}

async function fetchRecordBytes(filename: string, offset: number, length: number): Promise<Buffer> {
    const url = generateDownloadUrl(filename);
    const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
    let attempt = 0;
    let backoff = WAYBACK_INITIAL_BACKOFF;
    while (true) {
        try {
            console.log(`Fetching record bytes for ${filename} (range ${rangeHeader}, attempt ${attempt})...`);
            const response = await axios.get(url, {
                headers: { Range: rangeHeader },
                responseType: 'arraybuffer',
                timeout: WAYBACK_REQUEST_TIMEOUT,
            });
            const decompressed = zlib.gunzipSync(Buffer.from(response.data));
            return decompressed;
        } catch (error: any) {
            console.error(`Error fetching record bytes for ${url} range ${rangeHeader} (${error.message}), retrying in ${backoff / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
            attempt++;
        }
    }
}


function getCdxFilenameFromEntry(entry: CaptureEntry): string {
    const filename = entry.cdxEntry.filename;
    if (filename?.endsWith('.arc.gz')) {
        return filename.replace('.arc.gz', '.arc.os.cdx.gz');
    }
    else if (filename?.endsWith('.warc.gz')) {
        return filename.replace('.warc.gz', '.warc.os.cdx.gz');
    }
    else {
        throw new Error(`Unsupported archive format for fetching original record, only .arc.gz and .warc.gz are supported, but got ${filename}`);
    }
}

export async function fetchArchiveCdx(entry: CaptureEntry): Promise<CdxEntry> {
    const filename = entry.cdxEntry.filename;
    if (!filename) {
        throw new Error(`CDX entry for capture is missing filename, cannot fetch archive CDX`);
    }
    const cdxFilename = getCdxFilenameFromEntry(entry);
    const cdxEntry = await downloadCdx(cdxFilename, filename, entry);
    return cdxEntry;
}

export async function fetchArchiveRecord(entry: CaptureEntry): Promise<ArchiveRecord[]> {
    const offset = entry.cdxEntry.offset;
    const length = entry.cdxEntry.length;
    const filename = entry.cdxEntry.filename;
    if (offset === undefined || length === undefined || filename === undefined) {
        throw new Error(`CDX entry for ${filename} is missing offset, length, or filename`);
    }
    const content = await fetchRecordBytes(filename, offset, length);
    const outputType = filename.endsWith('.arc.gz') ? "arc" : filename.endsWith('.warc.gz') ? "warc" : null;
    if (!outputType) {
        throw new Error(`Unsupported archive format for fetching original record, only .arc.gz and .warc.gz are supported, but got ${filename}`);
    }
    return [{ type: outputType, content }];
}
