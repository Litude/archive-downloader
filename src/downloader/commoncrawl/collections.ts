import axios from "axios";
import { DateTime } from "luxon";
import {
  CommonCrawlCollection,
  CommonCrawlDownloaderOptions,
} from "../../types/commoncrawl-types.js";
import { UrlEntry } from "../../types/download-input-types.js";
import { COMMONCRAWL_COLLECTIONS_URL, COMMONCRAWL_REQUEST_TIMEOUT } from "./commoncrawl-common.js";

let cachedCollections: CommonCrawlCollection[] | null = null;

export function getCommonCrawlCollection(collectionId: string) {
  if (cachedCollections === null) {
    throw new Error("Common Crawl collections have not been fetched yet");
  }
  const collection = cachedCollections.find((c) => c.id === collectionId);
  if (!collection) {
    throw new Error(`Collection with id ${collectionId} not found`);
  }
  return collection;
}

export async function fetchAllCollections(
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlCollection[]> {
  if (cachedCollections !== null) {
    return cachedCollections;
  }

  const timeout = options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT;
  console.log(`Fetching Common Crawl collections from ${COMMONCRAWL_COLLECTIONS_URL}...`);

  const response = await axios.get<CommonCrawlCollection[]>(COMMONCRAWL_COLLECTIONS_URL, {
    timeout,
  });

  cachedCollections = response.data;
  console.log(`Fetched ${cachedCollections.length} Common Crawl collections.`);
  return cachedCollections;
}

export function filterCollectionsByTimestamp(
  collections: CommonCrawlCollection[],
  minTimestamp?: string,
  maxTimestamp?: string,
): CommonCrawlCollection[] {
  let minDt: DateTime | undefined;
  let maxDt: DateTime | undefined;

  if (minTimestamp) {
    minDt = DateTime.fromFormat(minTimestamp, "yyyyMMddHHmmss", { zone: "utc" });
    if (!minDt.isValid) {
      throw new Error(`Invalid minTimestamp format: ${minTimestamp}`);
    }
  }

  if (maxTimestamp) {
    maxDt = DateTime.fromFormat(maxTimestamp, "yyyyMMddHHmmss", { zone: "utc" });
    if (!maxDt.isValid) {
      throw new Error(`Invalid maxTimestamp format: ${maxTimestamp}`);
    }
  }

  return collections.filter((collection) => {
    const collFrom = DateTime.fromISO(collection.from, { zone: "utc" });
    const collTo = DateTime.fromISO(collection.to, { zone: "utc" });

    if (!collFrom.isValid || !collTo.isValid) {
      console.log(
        `Skipping collection ${collection.id}: invalid from/to timestamps (from="${collection.from}", to="${collection.to}")`,
      );
      return false;
    }

    // Collection must have started at or before maxTimestamp
    if (maxDt !== undefined && collFrom > maxDt) {
      return false;
    }

    // Collection must have ended at or after minTimestamp
    if (minDt !== undefined && collTo < minDt) {
      return false;
    }

    return true;
  });
}

export async function getFilteredCollections(
  urlEntry: UrlEntry,
  options?: CommonCrawlDownloaderOptions,
): Promise<{ collections: CommonCrawlCollection[]; wasFetched: boolean }> {
  const wasCached = cachedCollections !== null;
  const allCollections = await fetchAllCollections(options);
  const collections = filterCollectionsByTimestamp(
    allCollections,
    urlEntry.minTimestamp,
    urlEntry.maxTimestamp,
  );
  return { collections, wasFetched: !wasCached };
}
