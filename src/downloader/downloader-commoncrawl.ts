import { ExtendedCdxEntry } from "../types/wayback-types.js";
import { CaptureCommonCrawlMetadata, CaptureEntry } from "../types/capture-types.js";
import { DownloadFileInput, UrlEntry } from "../types/download-input-types.js";
import {
  CommonCrawlDownloadedFile,
  CommonCrawlDownloaderOptions,
} from "../types/commoncrawl-types.js";
import {
  COMMONCRAWL_REQUEST_DELAY_MS,
  COMMONCRAWL_REQUEST_TIMEOUT,
} from "./commoncrawl/commoncrawl-common.js";
import { getFilteredCollections } from "./commoncrawl/collections.js";
import { fetchCdxEntriesForCollection } from "./commoncrawl/cdx-entries.js";
import { downloadCommonCrawlFile } from "./commoncrawl/file-download.js";
import { computeSha256, computeBase32EncodedSha1 } from "../utils/hash.js";
import { classifyEntry } from "../classification/classifier.js";
import { extractMimeTypeFromContentType } from "../utils/mimetype.js";
import { resolveCommonCrawlRevisitRecords } from "./commoncrawl/commoncrawl-revisit.js";
import { parseCommonCrawlTimestamps } from "./commoncrawl/commoncrawl-timestamps.js";
import { sanityCheckTimestamps } from "../utils/timestamp.js";
import { UrlMetadataFilteredEntries } from "../file-output/url-metadata.js";
import { CommonCrawlPrefetchedIndex } from "./commoncrawl/cdx-prefetch.js";
import { urlToUrlkey } from "../utils/urlkey.js";

function filterPrefetchedEntries(
  cachedEntries: ExtendedCdxEntry[],
  urlEntry: UrlEntry,
  commonCrawlCollections?: string[],
): ExtendedCdxEntry[] {
  const targetUrlkey = urlToUrlkey(urlEntry.url);
  return cachedEntries
    .filter((entry) => {
      if (entry.urlkey !== targetUrlkey) {
        return false;
      }
      if (urlEntry.maxTimestamp && entry.timestamp > urlEntry.maxTimestamp) {
        return false;
      }
      if (urlEntry.minTimestamp && entry.timestamp < urlEntry.minTimestamp) {
        return false;
      }
      if (commonCrawlCollections && !commonCrawlCollections.includes(entry.collection!)) {
        return false;
      }
      return true;
    })
    .map((entry) => ({ ...entry, requestUrl: urlEntry.url }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchCommonCrawlCdxEntries(
  urlEntry: UrlEntry,
  options?: CommonCrawlDownloaderOptions,
  commonCrawlCollections?: string[],
  prefetchedIndex?: CommonCrawlPrefetchedIndex,
): Promise<ExtendedCdxEntry[]> {
  const resolvedOptions = {
    requestDelayMs: options?.requestDelayMs ?? COMMONCRAWL_REQUEST_DELAY_MS,
    requestTimeoutMs: options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT,
  };

  if (prefetchedIndex) {
    for (const [prefix, cachedEntries] of prefetchedIndex) {
      if (urlEntry.url.startsWith(prefix)) {
        const entries = filterPrefetchedEntries(cachedEntries, urlEntry, commonCrawlCollections);
        console.log(
          `Using pre-fetched CDX index for ${urlEntry.url} (prefix: ${prefix}), found ${entries.length} entries.`,
        );
        return entries;
      }
    }
  }

  console.log(`Fetching Common Crawl CDX entries for ${urlEntry.url}...`);

  const { collections, wasFetched } = await getFilteredCollections(
    urlEntry,
    resolvedOptions,
    commonCrawlCollections,
  );

  if (wasFetched) {
    await new Promise((res) => setTimeout(res, resolvedOptions.requestDelayMs));
  }

  console.log(`Found ${collections.length} matching collection(s) for ${urlEntry.url}.`);

  if (collections.length === 0) {
    return [];
  }

  const allEntries: ExtendedCdxEntry[] = [];

  for (const collection of collections) {
    const entries = await fetchCdxEntriesForCollection(urlEntry, collection, resolvedOptions);
    console.log(`Found ${entries.length} CDX entries for ${urlEntry.url} in ${collection.id}.`);
    allEntries.push(...entries);
  }
  allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  console.log(`Total Common Crawl CDX entries for ${urlEntry.url}: ${allEntries.length}`);

  return allEntries;
}

function buildCaptureEntry(entry: ExtendedCdxEntry, file: CommonCrawlDownloadedFile): CaptureEntry {
  const sha256 = computeSha256(file.content);
  const actualDigest = computeBase32EncodedSha1(file.content);

  const timestamps = parseCommonCrawlTimestamps(file.responseHeaders, entry.timestamp);
  sanityCheckTimestamps({
    url: entry.url,
    lastModified: timestamps.lastModified,
    serverDate: timestamps.serverDate,
    captureDate: timestamps.captureDate,
  });

  const mimetype =
    extractMimeTypeFromContentType(file.responseHeaders["content-type"]) || entry.mimetype;

  const classification = classifyEntry(
    entry.url,
    sha256,
    mimetype,
    file.content,
    file.classification,
    file.contentTruncationDetails,
    file.statusCode || entry.status || 0,
  );

  const fetchTimestamp = file.metadata?.find(([k]) => k === "x_commoncrawl_FetchTimestamp")?.[1];

  const collection = file.collection;
  if (!collection) {
    throw new Error(`Missing collection metadata for ${entry.url} (${entry.timestamp})`);
  }
  const commonCrawlMetadata: CaptureCommonCrawlMetadata = {
    fetchTimestamp: fetchTimestamp ? new Date(+fetchTimestamp).toISOString() : undefined,
    collection: {
      id: collection.id,
      title: collection.name,
      from: collection.from,
      to: collection.to,
    },
  };

  return {
    timestamp: entry.timestamp,
    captureTimestamp: timestamps.captureDate,
    cdxEntry: entry,
    lastModified: timestamps.lastModified,
    url: entry.url,
    statusCode: file.statusCode || entry.status,
    classification,
    mimetype,
    actualDigest,
    sha256,
    originalSha256: sha256,
    content: file.content,
    downloadStatus: "downloaded",
    responseHeaders: file.responseHeaders,
    rawResponseHeaders: file.rawResponseHeaders,
    headerOutput: file.rawResponseHeaders,
    hostIp: file.hostIp,
    protocol: file.protocol,
    records: file.records,
    metadata: {
      commoncrawl: commonCrawlMetadata,
    },
  };
}

function filterNonTrailingSlashRedirects(
  entries: CaptureEntry[],
  requestUrl: string,
): {
  filteredEntries: CaptureEntry[];
  redirectNonSlashFiltered: number;
} {
  let redirectNonSlashFiltered = 0;
  entries.filter((snapshot) => {
    if ([301, 302].includes(snapshot.statusCode ?? 0)) {
      const originalUrl = snapshot.url;
      if (requestUrl.endsWith("/") && !originalUrl.endsWith("/")) {
        redirectNonSlashFiltered++;
        return false;
      }
    }
    return true;
  });

  return { filteredEntries: entries, redirectNonSlashFiltered };
}

async function downloadUrlCommonCrawlEntries(
  urlEntry: UrlEntry,
  options?: CommonCrawlDownloaderOptions,
  commonCrawlCollections?: string[],
  prefetchedIndex?: CommonCrawlPrefetchedIndex,
): Promise<{ filteredEntries: CaptureEntry[]; redirectNonSlashFiltered: number }> {
  const cdxEntries = await fetchCommonCrawlCdxEntries(
    urlEntry,
    options,
    commonCrawlCollections,
    prefetchedIndex,
  );

  const files: { file: CommonCrawlDownloadedFile; entry: ExtendedCdxEntry }[] = [];
  const captureEntries: CaptureEntry[] = [];

  for (const entry of cdxEntries) {
    console.log(`Downloading ${entry.url} (${entry.timestamp})...`);
    const file = await downloadCommonCrawlFile(entry, options);
    files.push({ file, entry });
  }

  resolveCommonCrawlRevisitRecords(files);

  files.forEach(({ file, entry }) => {
    captureEntries.push(buildCaptureEntry(entry, file));
  });

  const { filteredEntries, redirectNonSlashFiltered } = filterNonTrailingSlashRedirects(
    captureEntries,
    urlEntry.url,
  );

  if (redirectNonSlashFiltered > 0) {
    console.log(
      `Filtered ${redirectNonSlashFiltered} non-trailing-slash redirects for ${urlEntry.url}.`,
    );
  }

  return {
    filteredEntries: filteredEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    redirectNonSlashFiltered,
  };
}

export async function downloadCommonCrawlEntries(
  input: DownloadFileInput,
  options?: CommonCrawlDownloaderOptions,
  prefetchedIndex?: CommonCrawlPrefetchedIndex,
): Promise<{ filteredEntries: CaptureEntry[]; metadata: UrlMetadataFilteredEntries }> {
  const captureEntries: CaptureEntry[] = [];

  let redirectNonSlashTotal = 0;
  for (const urlEntry of input.urls) {
    if (!urlEntry.mirrorUrl) {
      const result = await downloadUrlCommonCrawlEntries(
        urlEntry,
        options,
        input.commonCrawlCollections,
        prefetchedIndex,
      );
      redirectNonSlashTotal += result.redirectNonSlashFiltered;
      captureEntries.push(...result.filteredEntries);
    }
  }

  if (redirectNonSlashTotal > 0) {
    console.log(`Total filtered non-trailing-slash redirects: ${redirectNonSlashTotal}`);
  }
  return {
    filteredEntries: captureEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    metadata: {
      nonTrailingSlashUrlRedirects: redirectNonSlashTotal ? redirectNonSlashTotal : undefined,
    },
  };
}
