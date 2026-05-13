import { DateTime } from "luxon";
import { CaptureEntry } from "../types/capture-types.js";
import { getWaybackItemDetails } from "../downloader/wayback/item-metadata.js";
import { fetchCommonCrawlArchiveFileStats } from "../downloader/commoncrawl/archive-file-stats.js";
import { sortArchiveFileInfo } from "./crawlers-enrichment.js";

function applyStats(
  captureEntry: CaptureEntry,
  fileSize: number | undefined,
  fileMd5: string | undefined,
  fileMtime: string | undefined,
): void {
  if (fileSize === undefined && fileMd5 === undefined && fileMtime === undefined) {
    return;
  }
  if (!captureEntry.metadata) {
    captureEntry.metadata = {};
  }
  captureEntry.metadata.archiveFileInfo = sortArchiveFileInfo({
    ...captureEntry.metadata.archiveFileInfo,
    fileSize,
    fileMd5,
    fileModificationTime: fileMtime,
  });
}

async function enrichWaybackFileStats(captureEntry: CaptureEntry): Promise<void> {
  const filename = captureEntry.cdxEntry.filename;
  if (!filename) {
    return;
  }
  const slashIdx = filename.indexOf("/");
  if (slashIdx < 0) {
    return;
  }
  const itemId = filename.slice(0, slashIdx);
  const file = filename.slice(slashIdx + 1);
  const itemDetails = await getWaybackItemDetails(itemId);
  const fileEntry = itemDetails.files.find((f) => f.name === file);
  if (fileEntry) {
    const mtime =
      DateTime.fromSeconds(parseInt(fileEntry.mtime, 10), { zone: "utc" }).toISO({
        suppressMilliseconds: true,
      }) ?? undefined;
    applyStats(captureEntry, parseInt(fileEntry.size, 10), fileEntry.md5, mtime);
  }
}

async function enrichCommonCrawlFileStats(captureEntry: CaptureEntry): Promise<void> {
  const filename = captureEntry.cdxEntry.filename;
  if (!filename) {
    return;
  }
  const stats = await fetchCommonCrawlArchiveFileStats(filename);
  applyStats(captureEntry, stats.size, stats.md5, stats.mtime);
}

export async function enrichWithArchiveFileStats(captureEntry: CaptureEntry): Promise<void> {
  const source = captureEntry.cdxEntry.source;
  if (source === "wayback") {
    await enrichWaybackFileStats(captureEntry);
  } else if (source === "commoncrawl") {
    await enrichCommonCrawlFileStats(captureEntry);
  }
}
