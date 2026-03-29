import axios from "axios";
import zlib from "zlib";
import {
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";
import { fetchRangeBytes } from "../../archive-record/fetch-range-bytes.js";
import { fetchWarcGlobalHeader } from "../../archive-record/fetch-warc-global-header.js";
import { ArchiveRecord, CaptureEntry } from "../../types/capture-types.js";
import { parseCdx } from "../../cdx/cdx-parser.js";
import { CdxEntry } from "../../types/wayback-types.js";
import { sleep } from "../../utils/sleep.js";

const cachedAvailability: Record<string, boolean> = {};

const downloadUrlBase = "https://archive.org/download/";

function generateDownloadUrl(filename: string): string {
  return `${downloadUrlBase}${filename}`;
}

const ERROR_401_RETRY_LIMIT = 3;
const ERROR_403_RETRY_LIMIT = 5;

/** It seems even available records may return 401 randomly, so we must always retry any error a few times before assuming it is unavailable */
async function internalCheckRecordAvailability(filename: string): Promise<boolean> {
  let attempt = 1;
  let backoff = WAYBACK_INITIAL_BACKOFF;
  const url = generateDownloadUrl(filename);
  const itemId = filename.split("/")[0];
  let error401Count = 0;
  let error403Count = 0;
  while (true) {
    try {
      console.log(`Fetching availability for item ${itemId} (attempt ${attempt})...`);
      const response = await axios.head(url, { validateStatus: () => true });
      if (response.status === 200) {
        return true;
      }
      // Seems like 401 actually means that the file is not publicly available. The request can sometimes
      // also return 403 but it seems to be some sort of intermittent error that can happen even for publicly available items
      // but for some items 403 is all that is returned...? So we retry 403 a few times to be sure and if it keeps happening we assume it's not available.
      else if (response.status === 401) {
        error401Count++;
        if (error401Count >= ERROR_401_RETRY_LIMIT) {
          console.error(
            `Received 401 a total of ${ERROR_401_RETRY_LIMIT} times in a row for ${filename}, treating as not available.`,
          );
          return false;
        }
        await sleep(2000);
        attempt++;
      } else if (response.status === 403) {
        error403Count++;
        if (error403Count >= ERROR_403_RETRY_LIMIT) {
          console.error(
            `Received 403 a total of ${ERROR_403_RETRY_LIMIT} times in a row for ${filename}, treating as not available.`,
          );
          return false;
        }
        console.log(
          `Received 403 when checking availability for ${filename}, this may be an intermittent error.`,
        );
        await sleep(2000 * error403Count); // Wait a bit longer for each consecutive 403 to give the server a chance to recover
        attempt++;
      } else {
        throw new Error(`Unexpected status code ${response.status} for ${url}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error checking availability for ${url} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      // Wait a bit before retrying to avoid spamming the server
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
      attempt++;
    }
  }
}

export async function checkArchiveRecordPublicAvailability(filename: string): Promise<boolean> {
  // We assume that if one file is unavailable/available, then all files for that item are unavailable/available,
  // so we can cache the result by item ID to avoid making multiple requests for the same item.

  const itemId = filename.split("/")[0];
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
      const response = await axios.get(cdxUrl, {
        responseType: "arraybuffer",
        timeout: WAYBACK_REQUEST_TIMEOUT,
      });
      const decompressed = zlib.gunzipSync(Buffer.from(response.data));
      const text = decompressed.toString("utf-8");
      return parseCdx(text, "wayback");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error fetching CDX file for ${cdxUrl} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
      attempt++;
    }
  }
}

async function downloadCdx(cdxFilename: string, entryFilename: string, entry: CaptureEntry) {
  const itemId = entryFilename.split("/")[0];
  const cdxEntries = await fetchRecordArchiveCdx(cdxFilename, itemId);
  // Filter CDX entries to only those that match the capture timestamp and URL of the original entry, to avoid downloading unnecessary records
  const mainCdxEntry = entry.cdxEntry.revisitEntry ?? entry.cdxEntry;
  const matchingEntries = cdxEntries.filter(
    (cdxEntry) =>
      cdxEntry.timestamp === mainCdxEntry.timestamp &&
      cdxEntry.url === mainCdxEntry.url &&
      cdxEntry.digest === mainCdxEntry.digest &&
      cdxEntry.length === mainCdxEntry.length &&
      cdxEntry.status === mainCdxEntry.status,
  );
  if (matchingEntries.length === 0) {
    throw new Error(
      `No matching CDX entries found for ${cdxFilename} with timestamp ${entry.timestamp} and URL ${entry.url}?!`,
    );
  } else if (matchingEntries.length > 1) {
    console.warn(
      `Multiple matching CDX entries found for ${cdxFilename} with timestamp ${entry.timestamp} and URL ${entry.url}! Picking first.`,
    );
  }
  return matchingEntries[0];
}

async function fetchRecordBytes(filename: string, offset: number, length: number): Promise<Buffer> {
  const url = generateDownloadUrl(filename);
  return fetchRangeBytes(url, offset, length, {
    timeout: WAYBACK_REQUEST_TIMEOUT,
    initialBackoff: WAYBACK_INITIAL_BACKOFF,
    maxBackoff: WAYBACK_MAX_BACKOFF,
  });
}

async function fetchWarcGlobalHeaderForFilename(filename: string): Promise<Buffer> {
  return fetchWarcGlobalHeader(generateDownloadUrl(filename), {
    timeout: WAYBACK_REQUEST_TIMEOUT,
    initialBackoff: WAYBACK_INITIAL_BACKOFF,
    maxBackoff: WAYBACK_MAX_BACKOFF,
  });
}

function getCdxFilenameFromEntry(entry: CaptureEntry): string {
  const filename = entry.cdxEntry.filename;
  if (filename?.endsWith(".arc.gz")) {
    return filename.replace(".arc.gz", ".arc.os.cdx.gz");
  } else if (filename?.endsWith(".warc.gz")) {
    return filename.replace(".warc.gz", ".warc.os.cdx.gz");
  } else {
    throw new Error(
      `Unsupported archive format for fetching original record, only .arc.gz and .warc.gz are supported, but got ${filename}`,
    );
  }
}

export async function fetchArchiveCdx(entry: CaptureEntry): Promise<CdxEntry> {
  const filename = entry.cdxEntry.filename;
  if (!filename) {
    throw new Error("CDX entry for capture is missing filename, cannot fetch archive CDX");
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
  if (filename.endsWith(".arc.gz")) {
    return [{ type: "arc", content }];
  } else if (filename.endsWith(".warc.gz")) {
    const globalHeader = await fetchWarcGlobalHeaderForFilename(filename);
    return [
      { type: "warcinfo", content: globalHeader },
      { type: "warc", content },
    ];
  } else {
    throw new Error(
      `Unsupported archive format for fetching original record, only .arc.gz and .warc.gz are supported, but got ${filename}`,
    );
  }
}
