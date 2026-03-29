import { CommonCrawlDownloaderOptions, CommonCrawlIndexQuery } from "../../types/commoncrawl-types.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { COMMONCRAWL_REQUEST_DELAY_MS, COMMONCRAWL_REQUEST_TIMEOUT } from "./commoncrawl-common.js";
import { fetchAllCollections, filterCollectionsByTimestamp } from "./collections.js";
import { fetchCdxEntriesForCollectionByPrefix } from "./cdx-entries.js";

// Map from prefix to all pre-fetched CDX entries across all collections for that prefix.
// Entries retain their collection field so lookup-time filtering by collection is possible.
export type CommonCrawlPrefetchedIndex = Map<string, ExtendedCdxEntry[]>;

export async function prefetchCdxIndex(
  queries: CommonCrawlIndexQuery[],
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlPrefetchedIndex> {
  const resolvedOptions = {
    requestDelayMs: options?.requestDelayMs ?? COMMONCRAWL_REQUEST_DELAY_MS,
    requestTimeoutMs: options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT,
  };

  const index: CommonCrawlPrefetchedIndex = new Map();

  const allCollections = await fetchAllCollections(resolvedOptions);

  for (const query of queries) {
    console.log(`Pre-fetching CDX index for prefix ${query.prefix}...`);

    const collections = filterCollectionsByTimestamp(
      allCollections,
      query.minTimestamp,
      query.maxTimestamp,
    );

    console.log(`Found ${collections.length} matching collection(s) for prefix ${query.prefix}.`);

    const prefixEntries: ExtendedCdxEntry[] = [];

    for (const collection of collections) {
      const entries = await fetchCdxEntriesForCollectionByPrefix(
        query.prefix,
        collection,
        resolvedOptions,
      );
      console.log(
        `Found ${entries.length} CDX entries for prefix ${query.prefix} in ${collection.id}.`,
      );
      prefixEntries.push(...entries);
    }

    prefixEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    console.log(`Total pre-fetched CDX entries for prefix ${query.prefix}: ${prefixEntries.length}`);
    index.set(query.prefix, prefixEntries);
  }

  return index;
}
