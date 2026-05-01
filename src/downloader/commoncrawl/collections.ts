import axios from "axios";
import path from "path";
import fs from "fs";
import { DateTime } from "luxon";
import {
  CommonCrawlCollection,
  CommonCrawlDownloaderOptions,
} from "../../types/commoncrawl-types.js";
import { UrlEntry } from "../../types/download-input-types.js";
import {
  COMMONCRAWL_COLLECTIONS_URL,
  COMMONCRAWL_INITIAL_BACKOFF,
  COMMONCRAWL_MAX_BACKOFF,
  COMMONCRAWL_REQUEST_TIMEOUT,
} from "./commoncrawl-common.js";
import { Context } from "../../types/context.js";

let cachedCollections: CommonCrawlCollection[] | null = null;
const COLLECTIONS_CACHE_FILENAME = "commoncrawl_collinfo.json";

export async function getCommonCrawlCollection(context: Context, collectionId: string) {
  const collections = await fetchAllCollections(context.settings.websiteOutputDirectory);
  const collection = collections.find((c) => c.id === collectionId);
  if (!collection) {
    throw new Error(`Collection with id ${collectionId} not found`);
  }
  return collection;
}

function readCollectionsFromDisk(websiteOutputDirectory: string): CommonCrawlCollection[] | null {
  const cacheFilePath = path.join(websiteOutputDirectory, ".cache", COLLECTIONS_CACHE_FILENAME);
  if (!fs.existsSync(cacheFilePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(cacheFilePath, "utf-8");
    const parsed = JSON.parse(data);
    const cacheTimestamp = DateTime.fromISO(parsed.timestamp);
    if (!cacheTimestamp.isValid) {
      console.warn(`Invalid cache timestamp in ${cacheFilePath}, ignoring cache`);
      return null;
    }
    const ageInDays = DateTime.utc().diff(cacheTimestamp, "days").days;
    // Collections get stale, but since a website download also caches urls by collection and those don't get stale, it wouldn't make sense to invalidate the collection cache only
    if (ageInDays > 30) {
      console.warn(
        `Cache file ${cacheFilePath} is ${ageInDays.toFixed(1)} days old and might be stale.`,
      );
    }
    return parsed.data as CommonCrawlCollection[];
  } catch (error) {
    console.error(`Failed to read Common Crawl collections from disk:`, error);
    return null;
  }
}

function writeCollectionsToDisk(
  websiteOutputDirectory: string,
  collections: CommonCrawlCollection[],
) {
  const cacheFilePath = path.join(websiteOutputDirectory, ".cache", COLLECTIONS_CACHE_FILENAME);
  fs.mkdirSync(path.join(websiteOutputDirectory, ".cache"), { recursive: true });
  fs.writeFileSync(
    cacheFilePath,
    JSON.stringify({ timestamp: new Date().toISOString(), data: collections }, null, 2),
  );
}

async function fetchCollectionsUntilSuccess(
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlCollection[]> {
  const timeout = options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT;
  let backOff = COMMONCRAWL_INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching Common Crawl collections from ${COMMONCRAWL_COLLECTIONS_URL}...`);
      const response = await axios.get<CommonCrawlCollection[]>(COMMONCRAWL_COLLECTIONS_URL, {
        timeout,
      });
      const collections = response.data;
      if (!Array.isArray(collections) || collections.length === 0) {
        throw new Error(`Unexpected response format: expected an array of collections`);
      }
      return collections;
    } catch (error) {
      console.error(
        `Error fetching Common Crawl collections, retrying in ${backOff / 1000} seconds...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, backOff));
      backOff = Math.min(backOff * 2, COMMONCRAWL_MAX_BACKOFF);
    }
  }
}

export async function fetchAllCollections(
  websiteOutputDirectory: string,
  options?: CommonCrawlDownloaderOptions,
): Promise<CommonCrawlCollection[]> {
  if (cachedCollections !== null) {
    return cachedCollections;
  }
  const diskCollections = readCollectionsFromDisk(websiteOutputDirectory);
  if (diskCollections) {
    console.log(`Loaded Common Crawl collections from disk cache.`);
    cachedCollections = diskCollections;
    return cachedCollections;
  }

  cachedCollections = await fetchCollectionsUntilSuccess(options);

  console.log(`Fetched ${cachedCollections.length} Common Crawl collections.`);
  writeCollectionsToDisk(websiteOutputDirectory, cachedCollections);
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
  websiteOutputDirectory: string,
  options?: CommonCrawlDownloaderOptions,
  commonCrawlCollections?: string[],
): Promise<{ collections: CommonCrawlCollection[]; wasFetched: boolean }> {
  const wasCached = cachedCollections !== null;
  const allCollections = await fetchAllCollections(websiteOutputDirectory, options);
  let collections = filterCollectionsByTimestamp(
    allCollections,
    urlEntry.minTimestamp,
    urlEntry.maxTimestamp,
  );

  if (commonCrawlCollections && commonCrawlCollections.length > 0) {
    collections = collections.filter((collection) =>
      commonCrawlCollections.includes(collection.id),
    );
  }

  return { collections, wasFetched: !wasCached };
}
