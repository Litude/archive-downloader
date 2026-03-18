import { getSnapshotsForWebsiteFile } from "./wayback/snapshots";
import { computeSha256, computeWaybackDigest } from "../utils/hash";
import { classifyEntry } from "../classification/classifier";
import { DownloadedFile } from "../types/download-types";
import { parseHeaderTimestamps } from "../utils/timestamp";
import { downloadUniqueDigestsForSnapshots, fetchWaybackFileHeaders } from "./wayback/file-download";
import { CaptureClassification, CaptureEntry, CaptureWaybackMetadata } from "../types/capture-types";
import { getWaybackFilename } from "../utils/wayback-filename";
import { filenameToString } from "../file-name/file-name";
import { DateTime } from "luxon";
import { CdxEntry } from "../types/wayback-types";
import { DownloadFileInput } from "../types/download-input-types";
import { Context } from "../types/context";
import { getWaybackItemMetadata } from "./wayback/item-metadata";
import { checkArchiveRecordPublicAvailability, fetchArchiveCdx, fetchArchiveRecord } from "./wayback/archive-record";

function computeDigestHashes(uniqueDigestFiles: Map<string, DownloadedFile>) {
  const digestHashes = new Map<string, { sha256: string; actualDigest: string }>();

  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const sha256 = computeSha256(file.content);
    const actualDigest = computeWaybackDigest(file.content);
    digestHashes.set(digest, { sha256, actualDigest });
  });

  return digestHashes;
}

function classifyDigestFiles(uniqueDigestFiles: Map<string, DownloadedFile>, digestHashes: Map<string, { sha256: string; actualDigest: string }>, classificationOverrides?: Record<string, CaptureClassification>) {
  const classifications = new Map<string, CaptureClassification>();

  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const hashes = digestHashes.get(digest)!;
    const classification = classifyEntry(
      file.url,
      hashes.sha256,
      file.headers['content-type'],
      file.content,
      file.classification,
      file.statusCode,
      classificationOverrides,
    );
    classifications.set(digest, classification);
  });

  return classifications;
}

function isEntrySkipped(entry: CdxEntry, skippedCaptures?: { url: string; timestamp: string }[]) {
  if (!skippedCaptures) {
    return false;
  }
  return skippedCaptures.some(skipped => skipped.url === entry.url && skipped.timestamp === entry.timestamp);
}

export async function downloadWaybackEntries(
  input: DownloadFileInput,
  context: Context,
) {
  const { validCdxEntries, invalidCdxEntries, metadata } = await getSnapshotsForWebsiteFile(
    input, context
  );
  const peekAllFiles = context.settings.peekAllFiles;
  const fetchMetadata = context.settings.fetchMetadata;
  const fetchOriginalRecord = context.settings.fetchOriginalRecord;
  const allEntries = [...validCdxEntries, ...invalidCdxEntries];
  const uniqueDigestFiles = await downloadUniqueDigestsForSnapshots(allEntries.filter(entry => !isEntrySkipped(entry, input.skippedCaptures)));
  const digestFileHashes = computeDigestHashes(uniqueDigestFiles);
  const classifiedEntries = classifyDigestFiles(uniqueDigestFiles, digestFileHashes, input.classifications);

  let baseEntries: CaptureEntry[] = allEntries.map(entry => {
    const isSkipped = isEntrySkipped(entry, input.skippedCaptures);
    if (isSkipped) {
      return {
        timestamp: entry.timestamp,
        captureTimestamp: DateTime.fromFormat(entry.timestamp, 'yyyyLLddHHmmss', { zone: 'utc' }) as DateTime<true>,
        lastModified: null,
        cdxEntry: entry,
        url: entry.url,
        statusCode: entry.status,
        classification: 'skipped' as const,
        mimetype: entry.mimetype,
        actualDigest: undefined,
        sha256: undefined,
        originalSha256: undefined,
        content: undefined,
        downloadStatus: 'skipped',
        headers: undefined,
        metadata: undefined,
      }
    }
    else {
      const downloadedFile = entry.digest ? uniqueDigestFiles.get(entry.digest) : undefined;

      const downloadIsExactMatch = downloadedFile && entry.url === downloadedFile.url && entry.timestamp === downloadedFile.timestamp;
      const headers = downloadIsExactMatch ? downloadedFile.headers : entry.metadata?.headers;
      const rawHeaders = downloadIsExactMatch ? downloadedFile.rawHeaders : entry.metadata?.rawHeaders;
      const timestamps = headers ? parseHeaderTimestamps(entry.url, headers, entry.timestamp, true) : { captureDate: DateTime.fromFormat(entry.timestamp, 'yyyyLLddHHmmss', { zone: 'utc' }) as DateTime<true>, lastModified: null };
      const waybackFilename = peekAllFiles && headers ? getWaybackFilename(headers) : undefined;
      const lastModified = timestamps.lastModified;

      return {
        timestamp: entry.timestamp,
        captureTimestamp: timestamps.captureDate,
        cdxEntry: {
          ...entry,
          filename: waybackFilename ?? entry.filename,
          revisitEntry: entry.revisitEntry ?
            {
              ...entry.revisitEntry,
              filename: waybackFilename ?? entry.revisitEntry.filename
            }
            : undefined
        },
        lastModified,
        url: entry.url,
        statusCode: entry.status,
        classification: entry.digest ? classifiedEntries.get(entry.digest)! : "unavailable",
        mimetype: entry.mimetype,
        actualDigest: entry.digest ? digestFileHashes.get(entry.digest)!.actualDigest : undefined,
        sha256: entry.digest ? digestFileHashes.get(entry.digest)!.sha256 : undefined,
        originalSha256: entry.digest ? digestFileHashes.get(entry.digest)!.sha256 : undefined,
        content: downloadedFile?.content,
        downloadStatus: downloadIsExactMatch ? 'downloaded' : 'digest-match',
        headers,
        rawHeaders,
        metadata: downloadIsExactMatch ? downloadedFile.metadata : undefined,
      }
    }
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const unavailableEntries: CaptureEntry[] = baseEntries.filter(entry => entry.classification === 'unavailable').map((entry) => {
    const captureTimestamp = DateTime.fromFormat(entry.timestamp, 'yyyyLLddHHmmss', { zone: 'utc' });
    if (!captureTimestamp.isValid) {
      throw new Error(`Invalid capture timestamp format: ${entry.timestamp}`);
    }
    return {
      timestamp: entry.timestamp,
      captureTimestamp,
      lastModified: null,
      cdxEntry: entry.cdxEntry,
      url: entry.url,
      statusCode: entry.statusCode,
      classification: entry.classification,
      mimetype: entry.mimetype,
      actualDigest: '',
      sha256: '',
      originalSha256: undefined,
      content: Buffer.alloc(0),
      downloadStatus: 'unavailable',
      headers: undefined,
      rawHeaders: undefined,
      metadata: undefined,
    };
  });
  if (unavailableEntries.length > 0) {
    console.log(`Total unavailable entries for ${filenameToString(input.filename, 'simple')}: ${unavailableEntries.length}`);
  }
  const skippedEntries = baseEntries.filter(entry => entry.classification === 'skipped');
  if (skippedEntries.length > 0) {
    console.log(`Total skipped entries for ${filenameToString(input.filename, 'simple')}: ${skippedEntries.length}`);
  }
  baseEntries = baseEntries.filter(entry => entry.classification !== 'unavailable' && entry.classification !== 'skipped');

  // If peekAllFiles is enabled, we need to query wayback for the headers of all files that were not downloaded exactly
  if (peekAllFiles) {
    const entriesToPeek = baseEntries.filter(entry => !entry.headers);
    const prefetchedHeaders = baseEntries.filter(entry => entry.headers && entry.downloadStatus !== "downloaded").length;
    if (prefetchedHeaders > 0) {
      console.log(`Note: ${prefetchedHeaders} entries have had their headers already fetched.`);
    }
    console.log(`Headers to fetch for entries that were not downloaded: ${entriesToPeek.length}`);
    let currentIndex = 0;
    for (const entry of entriesToPeek) {
      console.log(`Fetching headers for ${entry.url} at ${entry.timestamp} (${++currentIndex}/${entriesToPeek.length}): `);
      const response = await fetchWaybackFileHeaders(entry.timestamp, entry.url, entry.statusCode ? [entry.statusCode] : undefined);
      const timestamps = parseHeaderTimestamps(entry.url, response.headers, entry.timestamp, true);
      const waybackFilename = getWaybackFilename(response.headers);
      const existingEntry = baseEntries.find(e => e.url === entry.url && e.timestamp === entry.timestamp);
      if (!existingEntry) {
        throw new Error(`Existing entry for ${entry.url} at ${entry.timestamp} not found?!`);
      }
      existingEntry.lastModified = timestamps.lastModified;
      existingEntry.headers = response.headers;
      existingEntry.rawHeaders = response.rawHeaders;
      existingEntry.cdxEntry.filename = waybackFilename;
    }
  }

  if (fetchMetadata) {
    console.log(`Fetching metadata for all entries...`);
    for (const entry of baseEntries) {
      if (entry.cdxEntry.filename) {
        const itemId = entry.cdxEntry.filename.split('/')[0];
        if (itemId) {
          const metadata = await getWaybackItemMetadata(itemId)
          const collections = [];
          const collectionIds = Array.isArray(metadata.collection) ? metadata.collection : [metadata.collection];
          for (const collectionId of collectionIds) {
            if (collectionId === 'web') {
              continue; // skip the generic "web" collection which is not very informative and is present on all items
            }
            try {
              const collectionMetadata = await getWaybackItemMetadata(collectionId);
              if (collectionMetadata) {
                collections.push(collectionMetadata);
              }
            } catch (e) {
              console.log(`Error fetching metadata for collection ${collectionId}: ${e}`);
              collections.push({
                identifier: collectionId,
                title: '',
                description: '',
              })
            }
          }

          const parsedData: CaptureWaybackMetadata = {
            item: {
              id: metadata.identifier,
              title: metadata.title,
              contributor: metadata.contributor,
              sponsor: metadata.sponsor && metadata.sponsor !== metadata.contributor ? metadata.sponsor : undefined,
              description: metadata.description,
              coverage: metadata.coverage,
              notes: metadata.notes,
              crawler: metadata.crawler,
              crawljob: metadata.crawljob ?? metadata['pwacrawlid'],
              numPages: metadata.imagecount ? parseInt(metadata.imagecount) : undefined,
              numWarcs: metadata.numwarcs ? parseInt(metadata.numwarcs) : undefined,
              numArcs: metadata.numarcs ? parseInt(metadata.numarcs) : undefined,
              collections: collections.map(col => ({
                id: col.identifier,
                title: col.title,
                description: col.description,
              })),
            }
          }
          if (!entry.metadata) {
            entry.metadata = {};
          }
          entry.metadata.wayback = parsedData;
        }
      }
    }
  }

  if (fetchOriginalRecord) {
    console.log(`Fetching original records for all entries...`);
    for (const entry of baseEntries) {
      if (entry.cdxEntry.filename) {
        const available = await checkArchiveRecordPublicAvailability(entry.cdxEntry.filename);
        if (!available) {
          console.log(`Original record for ${entry.cdxEntry.filename} is NOT publicly available.`);
        }
        else {
          console.log(`Original record for ${entry.cdxEntry.filename} IS publicly available!`);
          const fullCdx = await fetchArchiveCdx(entry);
          entry.cdxEntry.offset = fullCdx.offset;
          if (entry.cdxEntry.revisitEntry) {
              entry.cdxEntry.revisitEntry.offset = fullCdx.offset;
          }
          const records = await fetchArchiveRecord(entry);
          entry.records = records;
        }
      }
    }
  }

  return { baseEntries, unavailableEntries, skippedEntries, metadata };
}
