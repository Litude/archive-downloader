import { DateTime } from "luxon";
import { CommonCrawlDownloadedFile } from "../../types/commoncrawl-types.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";

export function resolveCommonCrawlRevisitRecords(
  files: { file: CommonCrawlDownloadedFile; entry: ExtendedCdxEntry }[],
): void {
  for (const { file, entry } of files) {
    if (entry.mimetype === "warc/revisit") {
      console.log(`Found revisit record for ${entry.url} (${entry.timestamp}), resolving...`);
      const warcType = file.metadata?.find(([k, _]) => k.toLowerCase() === "warc-type")?.[1];
      if (warcType !== "revisit") {
        throw new Error(
          `Expected WARC-Type header with value "revisit" for revisit record, but got "${warcType}" for ${entry.url} (${entry.timestamp})`,
        );
      }
      const refersToUrl = file.metadata?.find(
        ([k, _]) => k.toLowerCase() === "warc-refers-to-target-uri",
      )?.[1];
      const refersToDate = file.metadata?.find(
        ([k, _]) => k.toLowerCase() === "warc-refers-to-date",
      )?.[1];
      if (!refersToUrl || !refersToDate) {
        throw new Error(
          `Missing WARC-Refers-To-Target-URI or WARC-Refers-To-Date header in revisit record for ${entry.url} (${entry.timestamp})`,
        );
      }
      const refersToTimestamp = DateTime.fromISO(refersToDate).toUTC().toFormat("yyyyMMddHHmmss");
      const referredEntry = files.find(
        (f) => f.entry.url === refersToUrl && f.entry.timestamp === refersToTimestamp,
      );
      if (!referredEntry) {
        throw new Error(
          `Could not find referred record for revisit record ${entry.url} (${entry.timestamp}). Referred URL: ${refersToUrl}, Referred Date: ${refersToDate}`,
        );
      }
      console.log(
        `Resolving revisit record ${entry.url} (${entry.timestamp}) to referred record ${referredEntry.entry.url} (${referredEntry.entry.timestamp})`,
      );
      // Store copy of original under revisitEntry
      entry.revisitEntry = {
        urlkey: entry.urlkey,
        timestamp: entry.timestamp,
        url: entry.url,
        status: entry.status,
        digest: entry.digest,
        mimetype: entry.mimetype,
        filename: entry.filename,
        offset: entry.offset,
        length: entry.length,
      };
      // Update entry with referred record data
      entry.status = referredEntry.entry.status;
      entry.mimetype = referredEntry.entry.mimetype;
      // Seems that commoncrawl omits the digest for revisit records completely?
      entry.digest = referredEntry.entry.digest;
      file.content = referredEntry.file.content;
      file.statusCode = referredEntry.file.statusCode;
      file.classification = referredEntry.file.classification;
      file.contentTruncationDetails = referredEntry.file.contentTruncationDetails;
    }
  }
}
