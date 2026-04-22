import {
  CommonCrawlDownloaderOptions,
  CommonCrawlIndexQuery,
} from "../../types/commoncrawl-types.js";
import fs from "fs";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { COMMONCRAWL_REQUEST_DELAY_MS, COMMONCRAWL_REQUEST_TIMEOUT } from "./commoncrawl-common.js";
import { fetchAllCollections, filterCollectionsByTimestamp } from "./collections.js";
import { fetchCdxEntriesForCollectionByPrefix } from "./cdx-entries.js";
import path from "path";
import { DateTime } from "luxon";

// Map from prefix to all pre-fetched CDX entries across all collections for that prefix.
// Entries retain their collection field so lookup-time filtering by collection is possible.
export type CommonCrawlPrefetchedIndex = Map<
  string,
  {
    minTimestamp?: string;
    maxTimestamp?: string;
    collections?: string[]; // Optional list of collection IDs that were included in the prefetching for this prefix
    entries: ExtendedCdxEntry[];
  }
>;

interface CommonCrawlIndexCacheEntry {
  prefix: string;
  minTimestamp?: string;
  maxTimestamp?: string;
  collections?: string[]; // Optional list of collection IDs that were included in the prefetching for this prefix
  entries: ExtendedCdxEntry[];
}

function writeCacheToDisk(index: CommonCrawlPrefetchedIndex, websiteOutputDirectory: string) {
  const resultArray: CommonCrawlIndexCacheEntry[] = [...index.keys()].map((key) => {
    return {
      prefix: key,
      minTimestamp: index.get(key)?.minTimestamp,
      maxTimestamp: index.get(key)?.maxTimestamp,
      collections: index.get(key)?.collections,
      entries: index.get(key)?.entries || [],
    };
  });

  fs.mkdirSync(path.join(websiteOutputDirectory, ".cache"), { recursive: true });
  fs.writeFileSync(
    path.join(websiteOutputDirectory, ".cache", `commoncrawl_cdx.json`),
    JSON.stringify({ timestamp: new Date().toISOString(), data: resultArray }, null, 2),
  );
}

function readCacheFromDisk(
  queries: CommonCrawlIndexQuery[],
  websiteOutputDirectory: string,
): { cachedIndex: CommonCrawlPrefetchedIndex | null; missingQueries: CommonCrawlIndexQuery[] } {
  const cacheFilePath = path.join(websiteOutputDirectory, ".cache", `commoncrawl_cdx.json`);
  if (!fs.existsSync(cacheFilePath)) {
    return { cachedIndex: null, missingQueries: queries };
  }

  const fileContent = fs.readFileSync(cacheFilePath, "utf-8");
  const rawData: {
    timestamp: string;
    data: CommonCrawlIndexCacheEntry[];
  } = JSON.parse(fileContent);
  if (!rawData.timestamp || !rawData.data) {
    console.warn("Cache file is missing required fields. Ignoring cache.");
    return { cachedIndex: null, missingQueries: queries };
  }
  const diff = DateTime.fromISO(rawData.timestamp).diffNow("days").as("days");
  if (Math.abs(diff) > 30) {
    console.warn(
      "CommonCrawl cache file is older than 30 days. Proceeding anyway since common crawl indexes should never get stale.",
    );
  }

  const parsed: CommonCrawlIndexCacheEntry[] = rawData.data;

  const matchingIndexes = parsed.filter((item) => {
    const query = queries.find((q) => q.prefix === item.prefix);
    if (!query) {
      return false;
    }
    if (item.minTimestamp && !query.minTimestamp) {
      return false;
    }
    if (item.maxTimestamp && !query.maxTimestamp) {
      return false;
    }
    if (query.minTimestamp && item.minTimestamp && item.minTimestamp > query.minTimestamp) {
      return false;
    }
    if (query.maxTimestamp && item.maxTimestamp && item.maxTimestamp < query.maxTimestamp) {
      return false;
    }
    if (!query.collections && item.collections) {
      return false;
    }
    if (query.collections && query.collections.length > 0 && item.collections) {
      if (!query.collections.every((col) => item.collections?.includes(col))) {
        return false;
      }
    }
    return true;
  });

  const index: CommonCrawlPrefetchedIndex = new Map();
  for (const { prefix, minTimestamp, maxTimestamp, collections, entries } of matchingIndexes) {
    index.set(prefix, { minTimestamp, maxTimestamp, collections, entries });
  }
  const missingQueries = queries.filter((q) => !index.has(q.prefix));
  return { cachedIndex: index, missingQueries };
}

export async function prefetchCommonCrawlCdxIndex(
  queries: CommonCrawlIndexQuery[],
  websiteOutputDirectory: string,
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlPrefetchedIndex> {
  const { cachedIndex, missingQueries } = readCacheFromDisk(queries, websiteOutputDirectory);
  if (cachedIndex && missingQueries.length === 0) {
    console.log("Loaded pre-fetched CDX index from disk cache.");
    return cachedIndex;
  } else if (cachedIndex && missingQueries.length > 0) {
    console.log(
      `Loaded partial pre-fetched CDX index from disk cache. Missing ${missingQueries.length} query(ies) that will be fetched now.`,
    );
  } else {
    console.log(
      "No valid pre-fetched CDX index found in disk cache. All queries will be fetched from Common Crawl.",
    );
  }

  const resolvedOptions = {
    requestDelayMs: options?.requestDelayMs ?? COMMONCRAWL_REQUEST_DELAY_MS,
    requestTimeoutMs: options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT,
  };

  const index: CommonCrawlPrefetchedIndex = new Map();
  cachedIndex?.forEach((value, key) => {
    index.set(key, value);
  });

  const allCollections = await fetchAllCollections(resolvedOptions);

  for (const query of missingQueries) {
    console.log(`Pre-fetching CDX index for prefix ${query.prefix}...`);

    const collections = filterCollectionsByTimestamp(
      allCollections,
      query.minTimestamp,
      query.maxTimestamp,
    ).filter((collection) => {
      if (query.collections && query.collections.length > 0) {
        return query.collections.includes(collection.id);
      }
      return true;
    });

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
    console.log(
      `Total pre-fetched CDX entries for prefix ${query.prefix}: ${prefixEntries.length}`,
    );
    index.set(query.prefix, {
      minTimestamp: query.minTimestamp,
      maxTimestamp: query.maxTimestamp,
      collections: query.collections,
      entries: prefixEntries,
    });
  }
  writeCacheToDisk(index, websiteOutputDirectory);
  console.log(`Saved commoncrawl pre-fetched CDX index to disk cache.`);

  return index;
}
