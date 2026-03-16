import { DownloadedFile } from "../types/download-types";
import { CdxEntry } from "../types/wayback-types";
import { fetchWaybackFile } from "./file-download";

export async function downloadUniqueDigestsForSnapshots(input: CdxEntry[]) {
    const uniqueDigestCount = new Set(input.map(entry => entry.digest)).size;
    console.log(`Unique digests to download: ${uniqueDigestCount}`);
    let currentDigest = 0;
    const encounteredDigests = new Map<string, DownloadedFile>();
    for (const entry of input) {
        if (entry.digest && !encounteredDigests.has(entry.digest)) {
            console.log(`Downloading snapshot ${entry.timestamp} for URL ${entry.url} (${++currentDigest}/${uniqueDigestCount})`);
            const result = await fetchWaybackFile(entry.timestamp, entry.url, entry.status);
            encounteredDigests.set(entry.digest, result);
        }
    }
    return encounteredDigests;
}
