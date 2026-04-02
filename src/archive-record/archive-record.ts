import { commonCrawlCleanupData } from "../downloader/commoncrawl/commoncrawl-cleanup.js";
import { CaptureEntry } from "../types/capture-types.js";
import { parseArcFile } from "./arc.js";
import { parseWarcFile } from "./warc.js";

export function getArchivedRecord(entry: CaptureEntry) {
  const commonCrawlCollection = entry.metadata?.commonCrawl?.collection;
  const collectionCleanupData = commonCrawlCollection
    ? commonCrawlCleanupData[commonCrawlCollection.id] || {}
    : undefined;

  if (entry.records) {
    const arcRecord = entry.records.find((record) => record.type === "arc");
    if (arcRecord) {
      return parseArcFile(
        arcRecord.content,
        collectionCleanupData
          ? {
              contentLengthIncludesTrailingNewline:
                collectionCleanupData?.contentLengthIncludesTrailingNewline ?? false,
            }
          : undefined,
      );
    }
    const warcRecord = entry.records.find((record) => record.type === "warc");
    if (warcRecord) {
      return parseWarcFile(
        warcRecord.content,
        collectionCleanupData
          ? {
              extraBlankLineAfterHeaders:
                collectionCleanupData?.extraBlankLineAfterHeaders ?? false,
            }
          : undefined,
      );
    }
  }
  return null;
}
