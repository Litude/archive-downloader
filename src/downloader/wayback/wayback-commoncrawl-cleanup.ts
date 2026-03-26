import { classifyEntry } from "../../classification/classifier.js";
import { CaptureClassification, CaptureEntry } from "../../types/capture-types.js";
import { computeSha256, computeWaybackDigest } from "../../utils/hash.js";
import { fetchWaybackFile } from "./file-download.js";

/** It seems that ALL gzipped common crawl entries served by wayback are corrupt.
 *  Worse, they share the same digest that non-corrupt entries have, so if the digest
 *  matching happened to download a commoncrawl entry, all other entries with the same
 *  digest would end up being corrupt as well based on digest.
 *
 *  So we need a post-cleanup hack where we check for all commoncrawl entries and check
 *  if they were downloaded.
 *
 *  If the downloadStatus is 'downloaded', we need to lookup if there are any other entries
 *  with the same digest that are NOT from commoncrawl. If there are, we need to refetch one
 *  of the entries that is not from commoncrawl and replace the content of all matches with
 *  that one.
 *
 *  If the downloadStatus is not 'digest-match', we only need to redownload the commoncrawl
 *  entry and perform reclassification based on the result.
 */
export async function cleanUpCorruptCommonCrawlEntries(baseEntries: CaptureEntry[], classificationOverrides?: Record<string, CaptureClassification>) {
  for (const entry of baseEntries) {
    const isCommonCrawl = entry.metadata?.wayback?.item.collections.some(coll => coll.id === "commoncrawl");
    if (isCommonCrawl && entry.rawHeaders?.some(([key, value]) => key.toLowerCase() === "content-encoding" && value.toLowerCase() === "gzip")) {
      console.log(`Entry ${entry.url} at ${entry.timestamp} is gzipped and is from Common Crawl, performing post-cleanup.`);
      if (entry.downloadStatus === "downloaded") {
        const matchingNonCommonCrawlEntries = baseEntries.filter(e => e.cdxEntry.digest === entry.cdxEntry.digest && !e.metadata?.wayback?.item.collections.some(coll => coll.id === "commoncrawl"));
        if (matchingNonCommonCrawlEntries.length > 0) {
          console.log(`Found ${matchingNonCommonCrawlEntries.length} other entries with the same digest that are not from Common Crawl. Need to refetch actual content...`);
          const firstEntry = matchingNonCommonCrawlEntries[0];
          const fileContent = await fetchWaybackFile(firstEntry.timestamp, firstEntry.url, firstEntry.statusCode ?? 0);
          const sha256 = computeSha256(fileContent.content);
          const actualDigest = computeWaybackDigest(fileContent.content);
          const classification = classifyEntry(
            fileContent.url,
            sha256,
            fileContent.headers["content-type"],
            fileContent.content,
            fileContent.classification,
            fileContent.metadata,
            fileContent.statusCode,
            classificationOverrides,
          );
          if (classification.type !== firstEntry.classification) {
            console.log(`Classification of ${matchingNonCommonCrawlEntries.length} non-Common Crawl entries (${firstEntry.url} changed from ${firstEntry.classification} to ${classification.type} after refetching content.`);
          }
          else {
            console.log(`Classification of ${matchingNonCommonCrawlEntries.length} non-Common Crawl entries (${firstEntry.url}) remains the same (${classification.type}) after refetching content.`);
          }
          for (const matchingEntry of matchingNonCommonCrawlEntries) {
            matchingEntry.content = fileContent.content;
            matchingEntry.sha256 = sha256;
            matchingEntry.originalSha256 = sha256;
            matchingEntry.actualDigest = actualDigest;
            matchingEntry.classification = classification.type;
            matchingEntry.classificationDetails = classification.classificationDetails;
            matchingEntry.downloadStatus = "digest-match";
          }
          firstEntry.downloadStatus = "downloaded";
        }
      }
      else if (entry.downloadStatus === "digest-match") {
        console.log(`Common Crawl entry ${entry.url} at ${entry.timestamp} was not downloaded but had a digest match. Refetching content to verify...`);
        const fileContent = await fetchWaybackFile(entry.timestamp, entry.url, entry.statusCode ?? 0);
        const sha256 = computeSha256(fileContent.content);
        const actualDigest = computeWaybackDigest(fileContent.content);
        const classification = classifyEntry(
          fileContent.url,
          sha256,
          fileContent.headers["content-type"],
          fileContent.content,
          fileContent.classification,
          fileContent.metadata,
          fileContent.statusCode,
          classificationOverrides,
        );
        if (classification.type !== entry.classification) {
          console.log(`Classification of Common Crawl entry ${entry.url} at ${entry.timestamp} changed from ${entry.classification} to ${classification.type} after refetching content.`);
        }
        else {
          console.log(`Classification of Common Crawl entry ${entry.url} at ${entry.timestamp} remains the same (${classification.type}) after refetching content.`);
        }
        entry.content = fileContent.content;
        entry.sha256 = sha256;
        entry.originalSha256 = sha256;
        entry.actualDigest = actualDigest;
        entry.classification = classification.type;
        entry.classificationDetails = classification.classificationDetails;
        entry.downloadStatus = "downloaded";
      }
    }
  }
}
