import axios, { AxiosResponse } from "axios";
import { ExtendedCdxEntry, WaybackCdxIndexQuery } from "../../types/wayback-types.js";
import {
  WAYBACK_CDX_PREFETCH_DELAY_MS,
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";
import fs from "fs";
import path from "path";
import { DateTime } from "luxon";

const WAYBACK_CDX_API_URL = "http://web.archive.org/cdx/search/cdx";
const CACHE_MAX_AGE_DAYS = 30;

// Map from prefix to all pre-fetched CDX entries for that prefix.
export type WaybackPrefetchedCdxIndex = Map<
  string,
  {
    minTimestamp?: string;
    maxTimestamp?: string;
    entries: ExtendedCdxEntry[];
  }
>;

interface WaybackCdxIndexCacheEntry {
  prefix: string;
  minTimestamp?: string;
  maxTimestamp?: string;
  entries: ExtendedCdxEntry[];
}

function writeCacheToDisk(index: WaybackPrefetchedCdxIndex, websiteOutputDirectory: string) {
  const resultArray: WaybackCdxIndexCacheEntry[] = [...index.keys()].map((key) => ({
    prefix: key,
    minTimestamp: index.get(key)?.minTimestamp,
    maxTimestamp: index.get(key)?.maxTimestamp,
    entries: index.get(key)?.entries || [],
  }));

  fs.mkdirSync(path.join(websiteOutputDirectory, ".cache"), { recursive: true });
  fs.writeFileSync(
    path.join(websiteOutputDirectory, ".cache", "wayback_cdx.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), data: resultArray }, null, 2),
  );
}

function readCacheFromDisk(
  queries: WaybackCdxIndexQuery[],
  websiteOutputDirectory: string,
): { cachedIndex: WaybackPrefetchedCdxIndex | null; missingQueries: WaybackCdxIndexQuery[] } {
  const cacheFilePath = path.join(websiteOutputDirectory, ".cache", "wayback_cdx.json");
  if (!fs.existsSync(cacheFilePath)) {
    return { cachedIndex: null, missingQueries: queries };
  }

  const fileContent = fs.readFileSync(cacheFilePath, "utf-8");
  const rawData: {
    timestamp: string;
    data: WaybackCdxIndexCacheEntry[];
  } = JSON.parse(fileContent);
  if (!rawData.timestamp || !rawData.data) {
    console.warn("Wayback CDX cache file is missing required fields. Ignoring cache.");
    return { cachedIndex: null, missingQueries: queries };
  }

  const ageInDays = Math.abs(DateTime.fromISO(rawData.timestamp).diffNow("days").as("days"));
  if (ageInDays > CACHE_MAX_AGE_DAYS) {
    console.warn(
      `Wayback CDX cache is ${Math.floor(ageInDays)} days old (limit: ${CACHE_MAX_AGE_DAYS}). Refetching all queries.`,
    );
    return { cachedIndex: null, missingQueries: queries };
  }

  const parsed: WaybackCdxIndexCacheEntry[] = rawData.data;

  const matchingEntries = parsed.filter((item) => {
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
    return true;
  });

  const index: WaybackPrefetchedCdxIndex = new Map();
  for (const { prefix, minTimestamp, maxTimestamp, entries } of matchingEntries) {
    index.set(prefix, { minTimestamp, maxTimestamp, entries });
  }
  const missingQueries = queries.filter((q) => !index.has(q.prefix));
  return { cachedIndex: index, missingQueries };
}

function mapRowToEntry(row: string[], requestUrl: string): ExtendedCdxEntry {
  return {
    urlkey: row[6],
    timestamp: row[0],
    url: row[1],
    status: row[2] && row[2] !== "-" ? parseInt(row[2], 10) : undefined,
    digest: row[3],
    mimetype: row[4],
    length: row[5] ? parseInt(row[5], 10) : undefined,
    filename: row[7] ?? undefined,
    offset: row[8] ? parseInt(row[8], 10) : undefined,
    source: "wayback",
    requestUrl,
  };
}

async function fetchWaybackCdxByPrefix(
  prefix: string,
  minTimestamp?: string,
  maxTimestamp?: string,
): Promise<ExtendedCdxEntry[]> {
  // Strip trailing "/" so that entries exactly matching the prefix are included
  const queryPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;

  const allEntries: ExtendedCdxEntry[] = [];
  let resumeKey: string | undefined;
  let page = 1;

  do {
    let attempt = 1;
    let backoff = WAYBACK_INITIAL_BACKOFF;
    while (true) {
      try {
        console.log(
          `Fetching Wayback CDX entries for prefix ${prefix} (page ${page}, attempt ${attempt})...`,
        );
        const params: Record<string, string> = {
          url: queryPrefix,
          output: "json",
          fl: "timestamp,original,statuscode,digest,mimetype,length,urlkey,filename,offset",
          matchType: "prefix",
          resolveRevisits: "false",
          showResumeKey: "true",
        };
        if (minTimestamp) {
          params["from"] = minTimestamp;
        }
        if (maxTimestamp) {
          params["to"] = maxTimestamp;
        }
        if (resumeKey) {
          params["resumeKey"] = resumeKey;
        }
        const response: AxiosResponse<string[][]> = await axios.get(WAYBACK_CDX_API_URL, {
          params,
          timeout: WAYBACK_REQUEST_TIMEOUT,
        });
        const data = response.data;
        // The header row is only present on the first page
        const dataRows = page === 1 ? data.slice(1) : data;
        // If a resume key is present, the last two rows are: an empty row and the resume key row
        const lastRow = dataRows[dataRows.length - 1];
        if (lastRow && lastRow.length === 1) {
          resumeKey = lastRow[0];
          allEntries.push(...dataRows.slice(0, -2).map((row) => mapRowToEntry(row, prefix)));
        } else {
          resumeKey = undefined;
          allEntries.push(...dataRows.map((row) => mapRowToEntry(row, prefix)));
        }
        break;
      } catch (e) {
        console.log(
          `Error fetching Wayback CDX entries for prefix ${prefix} (page ${page}): ${e}, retrying in ${backoff / 1000}s...`,
        );
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
        attempt++;
      }
    }
    page++;
  } while (resumeKey);

  return allEntries;
}

export async function prefetchWaybackCdxIndex(
  queries: WaybackCdxIndexQuery[],
  websiteOutputDirectory: string,
): Promise<WaybackPrefetchedCdxIndex> {
  const { cachedIndex, missingQueries } = readCacheFromDisk(queries, websiteOutputDirectory);
  if (cachedIndex && missingQueries.length === 0) {
    console.log("Loaded pre-fetched Wayback CDX index from disk cache.");
    return cachedIndex;
  } else if (cachedIndex && missingQueries.length > 0) {
    console.log(
      `Loaded partial pre-fetched Wayback CDX index from disk cache. Missing ${missingQueries.length} query(ies) that will be fetched now.`,
    );
  } else {
    console.log(
      "No valid pre-fetched Wayback CDX index found in disk cache. All queries will be fetched from Wayback.",
    );
  }

  const index: WaybackPrefetchedCdxIndex = new Map();
  cachedIndex?.forEach((value, key) => {
    index.set(key, value);
  });

  for (const query of missingQueries) {
    const entries = await fetchWaybackCdxByPrefix(
      query.prefix,
      query.minTimestamp,
      query.maxTimestamp,
    );
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    console.log(`Found ${entries.length} Wayback CDX entries for prefix ${query.prefix}.`);
    index.set(query.prefix, {
      minTimestamp: query.minTimestamp,
      maxTimestamp: query.maxTimestamp,
      entries,
    });
    await new Promise((res) => setTimeout(res, WAYBACK_CDX_PREFETCH_DELAY_MS));
  }

  writeCacheToDisk(index, websiteOutputDirectory);
  console.log("Saved Wayback pre-fetched CDX index to disk cache.");

  return index;
}
