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
import { computeSha256, computeWaybackDigest } from "../utils/hash.js";
import { parseHeaderTimestamps } from "../utils/timestamp.js";
import { classifyEntry } from "../classification/classifier.js";
import { extractMimeTypeFromContentType } from "../utils/mimetype.js";
import { parseWarcinfoFile } from "../archive-record/warcinfo.js";
import { resolveCommonCrawlRevisitRecords } from "./commoncrawl/commoncrawl-revisit.js";

async function fetchCommonCrawlCdxEntries(
  urlEntry: UrlEntry,
  options?: CommonCrawlDownloaderOptions,
): Promise<ExtendedCdxEntry[]> {
  const resolvedOptions = {
    requestDelayMs: options?.requestDelayMs ?? COMMONCRAWL_REQUEST_DELAY_MS,
    requestTimeoutMs: options?.requestTimeoutMs ?? COMMONCRAWL_REQUEST_TIMEOUT,
  };

  console.log(`Fetching Common Crawl CDX entries for ${urlEntry.url}...`);

  const { collections, wasFetched } = await getFilteredCollections(urlEntry, resolvedOptions);

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

function extractCrawlData(file: CommonCrawlDownloadedFile) {
  const warcinfoRecord = file.records.find((r) => r.type === "warcinfo");
  if (!warcinfoRecord) {
    return undefined;
  }
  try {
    const { lines } = parseWarcinfoFile(warcinfoRecord.content);
    const get = (key: string) => lines.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
    const crawlData = {
      crawler: get("software"),
      crawljob: get("isPartOf"),
      description: get("description"),
      publisher: get("publisher"),
      operator: get("operator"),
    };
    const hasAnyValue = Object.values(crawlData).some((v) => v !== undefined);
    return hasAnyValue ? crawlData : undefined;
  } catch {
    return undefined;
  }
}

function buildCaptureEntry(entry: ExtendedCdxEntry, file: CommonCrawlDownloadedFile): CaptureEntry {
  const sha256 = computeSha256(file.content);
  const actualDigest = computeWaybackDigest(file.content);

  const timestamps = parseHeaderTimestamps(entry.url, file.responseHeaders, entry.timestamp, false);

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

  const crawlData = extractCrawlData(file);

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
    headerOutput: {
      original: file.rawResponseHeaders,
    },
    hostIp: file.hostIp,
    protocol: file.protocol,
    records: file.records,
    metadata: {
      commoncrawl: commonCrawlMetadata,
      crawlData,
    },
  };
}

async function downloadUrlCommonCrawlEntries(
  urlEntry: UrlEntry,
  options?: CommonCrawlDownloaderOptions,
): Promise<CaptureEntry[]> {
  const cdxEntries = await fetchCommonCrawlCdxEntries(urlEntry, options);

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

  return captureEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function downloadCommonCrawlEntries(
  input: DownloadFileInput,
  options?: CommonCrawlDownloaderOptions,
): Promise<CaptureEntry[]> {
  const captureEntries: CaptureEntry[] = [];

  for (const urlEntry of input.urls) {
    const entries = await downloadUrlCommonCrawlEntries(urlEntry, options);
    captureEntries.push(...entries);
  }

  return captureEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
