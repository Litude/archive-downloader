import axios from "axios";
import {
  CommonCrawlCdxEntry,
  CommonCrawlCollection,
  CommonCrawlDownloaderOptions,
} from "../../types/commoncrawl-types.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { UrlEntry } from "../../types/download-input-types.js";
import { COMMONCRAWL_INITIAL_BACKOFF, COMMONCRAWL_MAX_BACKOFF } from "./commoncrawl-common.js";

async function fetchCdxWithRetry(
  cdxApiUrl: string,
  url: string,
  options: Required<CommonCrawlDownloaderOptions>,
) {
  let attempt = 0;
  let backoff = COMMONCRAWL_INITIAL_BACKOFF;
  while (true) {
    try {
      const response = await axios.get<string>(cdxApiUrl, {
        timeout: options.requestTimeoutMs,
        responseType: "text",
        params: {
          url,
          output: "json",
        },
      });
      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 404 &&
        error.response.data
      ) {
        const resData = error.response.data;
        if (typeof resData === "string" && resData.toLowerCase().includes("no captures found")) {
          return "";
        }
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to fetch CDX entries from ${cdxApiUrl} for ${url} (${errorMessage}), attempt ${attempt + 1}, retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, COMMONCRAWL_MAX_BACKOFF);
      attempt++;
    }
  }
}

async function fetchCdx(
  cdxApiUrl: string,
  url: string,
  options: Required<CommonCrawlDownloaderOptions>,
): Promise<CommonCrawlCdxEntry[]> {
  const response = await fetchCdxWithRetry(cdxApiUrl, url, options);

  const lines = (response ?? "").split("\n");
  const entries: CommonCrawlCdxEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      entries.push(JSON.parse(trimmed) as CommonCrawlCdxEntry);
    } catch {
      console.log(`Failed to parse CDX line from ${cdxApiUrl}: ${trimmed}`);
    }
  }

  return entries;
}

function mapToExtendedCdxEntry(
  raw: CommonCrawlCdxEntry,
  collectionId: string,
  requestUrl: string,
): ExtendedCdxEntry {
  const statusParsed = parseInt(raw.status, 10);
  const lengthParsed = parseInt(raw.length, 10);
  const offsetParsed = parseInt(raw.offset, 10);

  return {
    urlkey: raw.urlkey,
    timestamp: raw.timestamp,
    url: raw.url,
    mimetype: raw.mime,
    digest: raw.digest,
    filename: raw.filename,
    status: isNaN(statusParsed) || raw.status === "-" ? undefined : statusParsed,
    length: isNaN(lengthParsed) ? undefined : lengthParsed,
    offset: isNaN(offsetParsed) ? undefined : offsetParsed,
    source: "commoncrawl",
    requestUrl,
    collection: collectionId,
  };
}

export async function fetchCdxEntriesForCollection(
  urlEntry: UrlEntry,
  collection: CommonCrawlCollection,
  options: Required<CommonCrawlDownloaderOptions>,
): Promise<ExtendedCdxEntry[]> {
  const cdxApiUrl = collection["cdx-api"];
  console.log(`Fetching CDX entries for ${urlEntry.url} from collection ${collection.id}...`);

  const rawEntries = await fetchCdx(cdxApiUrl, urlEntry.url, options);
  await new Promise((res) => setTimeout(res, options.requestDelayMs));

  return rawEntries.map((raw) => mapToExtendedCdxEntry(raw, collection.id, urlEntry.url));
}
