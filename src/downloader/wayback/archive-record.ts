import axios from "axios";
import zlib from "zlib";
import {
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";
import { fetchRangeBytes } from "../../archive-record/fetch-range-bytes.js";
import { fetchWarcGlobalHeader } from "../../archive-record/fetch-global-header-warc.js";
import { ArchiveRecord, CaptureEntry } from "../../types/capture-types.js";
import { parseCdx } from "../../cdx/cdx-parser.js";
import { CdxEntry } from "../../types/wayback-types.js";
import { getWaybackItemDetails } from "./item-metadata.js";
import { fetchArcGlobalHeader } from "../../archive-record/fetch-global-header-arc.js";
import { fetchWarcRecordWithAdjacentRecords } from "../../archive-record/fetch-adjacent-warc-records.js";

const downloadUrlBase = "https://archive.org/download/";

function generateDownloadUrl(filename: string): string {
  return `${downloadUrlBase}${filename}`;
}

export async function checkArchiveRecordPublicAvailability(filename: string): Promise<boolean> {
  // We assume that if one file is unavailable/available, then all files for that item are unavailable/available,
  // so we can cache the result by item ID to avoid making multiple requests for the same item.

  const [itemId, file] = filename.split("/");
  const itemDetails = await getWaybackItemDetails(itemId);
  const fileEntry = itemDetails.files.find((f) => f.name === file);
  if (!fileEntry) {
    throw new Error(
      `File ${file} not found in item ${itemId} details! Cannot determine availability!`,
    );
  }
  return fileEntry.private !== "true";
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

async function fetchArcGlobalHeaderForFilename(filename: string): Promise<Buffer> {
  return fetchArcGlobalHeader(generateDownloadUrl(filename), {
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
  if (filename.endsWith(".arc.gz")) {
    const content = await fetchRecordBytes(filename, offset, length);
    const arcHeader = await fetchArcGlobalHeaderForFilename(filename);
    return [
      { type: "arc-header", content: arcHeader },
      { type: "arc", content },
    ];
  } else if (filename.endsWith(".warc.gz")) {
    const fetchOptions = {
      timeout: WAYBACK_REQUEST_TIMEOUT,
      initialBackoff: WAYBACK_INITIAL_BACKOFF,
      maxBackoff: WAYBACK_MAX_BACKOFF,
    };
    const { mainContent, adjacentPrepended, adjacentTailing } =
      await fetchWarcRecordWithAdjacentRecords(
        generateDownloadUrl(filename),
        offset,
        length,
        fetchOptions,
      );
    const globalHeader = await fetchWarcGlobalHeaderForFilename(filename);
    const records = [
      { type: "warc-info" as const, content: globalHeader },
      ...adjacentPrepended,
      { type: "warc" as const, content: mainContent },
      ...adjacentTailing,
    ];
    console.log(
      `Fetched main record with ${records.length - 2} adjacent records (kept ${records.length} total) for ${filename} at offset ${offset} with length ${length}`,
    );
    return records;
  } else {
    throw new Error(
      `Unsupported archive format for fetching original record, only .arc.gz and .warc.gz are supported, but got ${filename}`,
    );
  }
}
