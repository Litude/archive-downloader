import axios, { AxiosResponse } from "axios";
import { ExtendedCdxEntry, WaybackCdxIndexQuery } from "../../types/wayback-types.js";
import { getMirrorPrefixesForPrefix } from "../../mirrors/mirrors.js";
import {
  WAYBACK_CDX_PREFETCH_DELAY_MS,
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";

const WAYBACK_CDX_API_URL = "http://web.archive.org/cdx/search/cdx";

// Map from prefix to all pre-fetched CDX entries for that prefix.
export type WaybackPrefetchedCdxIndex = Map<string, ExtendedCdxEntry[]>;

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
): Promise<WaybackPrefetchedCdxIndex> {
  const index: WaybackPrefetchedCdxIndex = new Map();

  for (const query of queries) {
    const prefixes = [query.prefix, ...getMirrorPrefixesForPrefix(query.prefix)];

    console.log(
      `Pre-fetching Wayback CDX index for prefix ${query.prefix} (${prefixes.length} prefix(es) including mirrors)...`,
    );

    for (const prefix of prefixes) {
      const entries = await fetchWaybackCdxByPrefix(prefix, query.minTimestamp, query.maxTimestamp);
      entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      console.log(`Found ${entries.length} Wayback CDX entries for prefix ${prefix}.`);
      index.set(prefix, entries);
      await new Promise((res) => setTimeout(res, WAYBACK_CDX_PREFETCH_DELAY_MS));
    }

    console.log(`Total pre-fetched Wayback CDX prefixes for ${query.prefix}: ${prefixes.length}`);
  }

  return index;
}
