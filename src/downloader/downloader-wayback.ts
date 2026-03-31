import { getSnapshotsForWebsiteFile } from "./wayback/snapshots.js";
import { computeSha256, computeBase32EncodedSha1 } from "../utils/hash.js";
import { classifyEntry } from "../classification/classifier.js";
import { DownloadedFile } from "../types/download-types.js";
import {
  downloadUniqueDigestsForSnapshots,
  fetchWaybackFile,
  fetchWaybackFileHeaders,
} from "./wayback/file-download.js";
import {
  CaptureClassification,
  CaptureEntry,
  CaptureWaybackMetadata,
  Classification,
} from "../types/capture-types.js";
import { getWaybackFilename } from "./wayback/wayback-filename.js";
import { filenameToString } from "../file-name/file-name.js";
import { DateTime } from "luxon";
import { CdxEntry } from "../types/wayback-types.js";
import { DownloadFileInput } from "../types/download-input-types.js";
import { Context } from "../types/context.js";
import { getWaybackItemMetadata } from "./wayback/item-metadata.js";
import {
  checkArchiveRecordPublicAvailability,
  fetchArchiveCdx,
  fetchArchiveRecord,
} from "./wayback/archive-record.js";
import {
  getContentLengthHeader,
  getHeaderValue,
  getUncompressedContentLength,
} from "../headers/headers.js";
import { cleanupWaybackHeaders } from "./wayback/header-cleanup.js";
import { tryToCompleteMissingCdxFields } from "./wayback/cdx-completion/cdx-completion.js";
import { cleanUpCorruptCommonCrawlEntries } from "./wayback/wayback-commoncrawl-cleanup.js";
import { extractMimeTypeFromContentType } from "../utils/mimetype.js";
import { getArchivedRecord } from "../archive-record/archive-record.js";
import { parseWaybackHeaderTimestamps } from "./wayback/wayback-timestamps.js";
import { sanityCheckTimestamps } from "../utils/timestamp.js";
import { WaybackMetadata } from "./wayback/wayback-types.js";

function computeDigestHashes(uniqueDigestFiles: Map<string, DownloadedFile>) {
  const digestHashes = new Map<string, { sha256: string; actualDigest: string }>();

  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const sha256 = computeSha256(file.content);
    const actualDigest = computeBase32EncodedSha1(file.content);
    digestHashes.set(digest, { sha256, actualDigest });
  });

  return digestHashes;
}

function classifyDigestFiles(
  uniqueDigestFiles: Map<string, DownloadedFile>,
  digestHashes: Map<string, { sha256: string; actualDigest: string }>,
  classificationOverrides?: Record<string, CaptureClassification>,
) {
  const classifications = new Map<string, Classification>();

  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const hashes = digestHashes.get(digest)!;
    const classification = classifyEntry(
      file.url,
      hashes.sha256,
      extractMimeTypeFromContentType(file.responseHeaders["content-type"]) ||
        file.responseHeaders["content-type"],
      file.content,
      file.classification,
      file.metadata,
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
  return skippedCaptures.some(
    (skipped) => skipped.url === entry.url && skipped.timestamp === entry.timestamp,
  );
}

export async function downloadWaybackEntries(input: DownloadFileInput, context: Context) {
  // return {
  //   baseEntries: [] as CaptureEntry[],
  //   unavailableEntries: [] as CaptureEntry[],
  //   skippedEntries: [] as CaptureEntry[],
  //   metadata: undefined as { crawler?: string; crawljob?: string; description?: string; publisher?: string; operator?: string } | undefined,
  // }

  const { validCdxEntries, invalidCdxEntries, metadata } = await getSnapshotsForWebsiteFile(
    input,
    context,
  );
  const fetchAllHeaders = context.settings.peekAllFiles;
  const fetchMetadata = context.settings.fetchMetadata;
  const fetchOriginalRecord = context.settings.fetchOriginalRecord;
  const allEntries = [...validCdxEntries, ...invalidCdxEntries];
  const uniqueDigestFiles = await downloadUniqueDigestsForSnapshots(
    allEntries.filter((entry) => !isEntrySkipped(entry, input.skippedCaptures)),
  );
  const digestFileHashes = computeDigestHashes(uniqueDigestFiles);
  const classifiedEntries = classifyDigestFiles(
    uniqueDigestFiles,
    digestFileHashes,
    input.classifications,
  );

  let baseEntries: CaptureEntry[] = allEntries
    .map((entry) => {
      const isSkipped = isEntrySkipped(entry, input.skippedCaptures);
      if (isSkipped) {
        return {
          timestamp: entry.timestamp,
          captureTimestamp: DateTime.fromFormat(entry.timestamp, "yyyyLLddHHmmss", {
            zone: "utc",
          }) as DateTime<true>,
          lastModified: null,
          cdxEntry: entry,
          url: entry.url,
          statusCode: entry.status,
          classification: { type: "skipped" } as const,
          mimetype: entry.mimetype,
          actualDigest: undefined,
          sha256: undefined,
          originalSha256: undefined,
          content: undefined,
          downloadStatus: "skipped" as const,
          responseHeaders: undefined,
          rawResponseHeaders: undefined,
          metadata: undefined,
        } satisfies CaptureEntry;
      } else {
        const downloadedFile = entry.digest ? uniqueDigestFiles.get(entry.digest) : undefined;

        const downloadIsExactMatch =
          downloadedFile &&
          entry.url === downloadedFile.url &&
          entry.timestamp === downloadedFile.timestamp;
        const headers = downloadIsExactMatch
          ? downloadedFile.responseHeaders
          : entry.metadata?.headers;
        const rawHeaders = downloadIsExactMatch
          ? downloadedFile.rawResponseHeaders
          : entry.metadata?.rawHeaders;
        const timestamps = headers
          ? parseWaybackHeaderTimestamps(headers, entry.timestamp)
          : {
              captureDate: DateTime.fromFormat(entry.timestamp, "yyyyLLddHHmmss", {
                zone: "utc",
              }) as DateTime<true>,
              lastModified: null,
              mementoDate: null,
              serverDate: null,
            };
        sanityCheckTimestamps({
          url: entry.url,
          lastModified: timestamps.lastModified,
          mementoDate: timestamps.mementoDate,
          serverDate: timestamps.serverDate,
          captureDate: timestamps.captureDate,
        });

        const waybackFilename =
          fetchAllHeaders && headers ? getWaybackFilename(headers) : undefined;
        const lastModified = timestamps.lastModified;

        return {
          timestamp: entry.timestamp,
          captureTimestamp: timestamps.captureDate,
          mementoDateTime: timestamps.mementoDate ?? undefined,
          cdxEntry: {
            ...entry,
            filename: waybackFilename ?? entry.filename,
            revisitEntry: entry.revisitEntry
              ? {
                  ...entry.revisitEntry,
                  filename: waybackFilename ?? entry.revisitEntry.filename,
                }
              : undefined,
          },
          lastModified,
          url: entry.url,
          statusCode: entry.status,
          classification: entry.digest
            ? classifiedEntries.get(entry.digest)!
            : { type: "unavailable" as const },
          mimetype: extractMimeTypeFromContentType(headers?.["content-type"]) || entry.mimetype,
          actualDigest: entry.digest ? digestFileHashes.get(entry.digest)!.actualDigest : undefined,
          sha256: entry.digest ? digestFileHashes.get(entry.digest)!.sha256 : undefined,
          originalSha256: entry.digest ? digestFileHashes.get(entry.digest)!.sha256 : undefined,
          content: downloadedFile?.content,
          downloadStatus: downloadIsExactMatch
            ? ("downloaded" as const)
            : ("digest-match" as const),
          responseHeaders: headers,
          rawResponseHeaders: rawHeaders,
        } satisfies CaptureEntry;
      }
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const unavailableEntries: CaptureEntry[] = baseEntries
    .filter((entry) => entry.classification.type === "unavailable")
    .map((entry) => {
      const captureTimestamp = DateTime.fromFormat(entry.timestamp, "yyyyLLddHHmmss", {
        zone: "utc",
      });
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
        mimetype:
          extractMimeTypeFromContentType(entry.responseHeaders?.["content-type"]) || entry.mimetype,
        actualDigest: "",
        sha256: "",
        originalSha256: undefined,
        content: Buffer.alloc(0),
        downloadStatus: "unavailable",
        responseHeaders: undefined,
        rawResponseHeaders: undefined,
        metadata: undefined,
      } satisfies CaptureEntry;
    });
  if (unavailableEntries.length > 0) {
    console.log(
      `Total unavailable entries for ${filenameToString(input.filename, "simple")}: ${unavailableEntries.length}`,
    );
  }
  const skippedEntries = baseEntries.filter((entry) => entry.classification.type === "skipped");
  if (skippedEntries.length > 0) {
    console.log(
      `Total skipped entries for ${filenameToString(input.filename, "simple")}: ${skippedEntries.length}`,
    );
  }
  baseEntries = baseEntries.filter(
    (entry) =>
      entry.classification.type !== "unavailable" && entry.classification.type !== "skipped",
  );

  // If fetchAllHeaders is enabled, we need to query wayback for the headers of all files that were not actually downloaded
  if (fetchAllHeaders) {
    const entriesToPeek = baseEntries.filter((entry) => !entry.responseHeaders);
    const prefetchedHeaders = baseEntries.filter(
      (entry) => entry.responseHeaders && entry.downloadStatus !== "downloaded",
    ).length;
    if (prefetchedHeaders > 0) {
      console.log(`Note: ${prefetchedHeaders} entries have had their headers already fetched.`);
    }
    console.log(`Headers to fetch for entries that were not downloaded: ${entriesToPeek.length}`);
    let currentIndex = 0;
    for (const entry of entriesToPeek) {
      console.log(
        `Fetching headers for ${entry.url} at ${entry.timestamp} (${++currentIndex}/${entriesToPeek.length}): `,
      );
      const response = await fetchWaybackFileHeaders(
        entry.timestamp,
        entry.url,
        entry.statusCode ? [entry.statusCode] : undefined,
      );
      const timestamps = parseWaybackHeaderTimestamps(response.responseHeaders, entry.timestamp);
      sanityCheckTimestamps({
        url: entry.url,
        lastModified: timestamps.lastModified,
        mementoDate: timestamps.mementoDate,
        serverDate: timestamps.serverDate,
        captureDate: timestamps.captureDate,
      });
      const waybackFilename = getWaybackFilename(response.responseHeaders);
      const existingEntry = baseEntries.find(
        (e) => e.url === entry.url && e.timestamp === entry.timestamp,
      );
      if (!existingEntry) {
        throw new Error(`Existing entry for ${entry.url} at ${entry.timestamp} not found?!`);
      }
      existingEntry.mimetype =
        extractMimeTypeFromContentType(response.responseHeaders["content-type"]) ||
        existingEntry.mimetype;
      existingEntry.mementoDateTime = timestamps.mementoDate ?? undefined;
      existingEntry.lastModified = timestamps.lastModified;
      existingEntry.responseHeaders = response.responseHeaders;
      existingEntry.rawResponseHeaders = response.rawResponseHeaders;
      existingEntry.cdxEntry.filename = waybackFilename;
    }
  }

  if (fetchMetadata) {
    console.log("Fetching metadata for all entries...");
    for (const entry of baseEntries) {
      if (entry.cdxEntry.filename) {
        const itemId = entry.cdxEntry.filename.split("/")[0];
        if (itemId) {
          const metadata = await getWaybackItemMetadata(itemId);
          const collections: WaybackMetadata[] = [];
          const collectionIds =
            metadata.collection && Array.isArray(metadata.collection)
              ? metadata.collection
              : metadata.collection
                ? [metadata.collection]
                : [];
          for (const collectionId of collectionIds) {
            if (collectionId === "web") {
              continue; // skip the generic "web" collection which is not very informative and is present on all items
            }
            const collectionMetadata = await getWaybackItemMetadata(collectionId);
            if (collectionMetadata) {
              collections.push(collectionMetadata);
            }
          }

          const parsedData: CaptureWaybackMetadata = {
            item: {
              id: metadata.identifier,
              title: metadata.title,
              contributor: metadata.contributor,
              sponsor:
                metadata.sponsor && metadata.sponsor !== metadata.contributor
                  ? metadata.sponsor
                  : undefined,
              description: metadata.description,
              coverage: metadata.coverage,
              notes: metadata.notes,
              crawler: metadata.crawler,
              crawljob: metadata.crawljob ?? metadata["pwacrawlid"],
              scanningCenter: metadata.scanningcenter,
              numPages: metadata.imagecount ? parseInt(metadata.imagecount) : undefined,
              scanDate: metadata.scandate,
              firstFileDate: metadata.firstfiledate,
              firstFileSerial: metadata.firstfileserial,
              lastFileDate: metadata.lastfiledate,
              lastFileSerial: metadata.lastfileserial,
              numWarcs: metadata.numwarcs ? parseInt(metadata.numwarcs) : undefined,
              numArcs: metadata.numarcs ? parseInt(metadata.numarcs) : undefined,
              collections: collections.map((col) => ({
                id: col.identifier,
                title: col.title,
                description: col.description,
              })),
            },
          };
          if (!entry.metadata) {
            entry.metadata = {};
          }
          entry.metadata.wayback = parsedData;
        }
      }
    }
  }

  if (fetchOriginalRecord) {
    console.log("Fetching original records for all entries...");
    for (const entry of baseEntries) {
      if (entry.cdxEntry.filename) {
        const available = await checkArchiveRecordPublicAvailability(entry.cdxEntry.filename);
        if (!available) {
          console.log(`Original record for ${entry.cdxEntry.filename} is NOT publicly available.`);
        } else {
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

  for (const entry of baseEntries) {
    const record = getArchivedRecord(entry);
    if (record) {
      entry.hostIp = record.ip;
      entry.protocol = record.protocol;
      entry.headerOutput = record.headers;
    } else if (entry.responseHeaders && entry.rawResponseHeaders) {
      entry.headerOutput = cleanupWaybackHeaders(
        entry.url,
        entry.responseHeaders,
        entry.rawResponseHeaders,
        input.filename,
        entry.captureTimestamp,
      );
    }
  }
  await tryToCompleteMissingCdxFields(baseEntries);

  // Post-cleanup: Need to check for possibly corrupt commoncrawl entries
  await cleanUpCorruptCommonCrawlEntries(baseEntries, input.classifications);

  // After cleanup check that content size of all entries matches the content-length header (if available)
  // else throw an error since this must be investigated manually and indicates a problem with the downloaded data
  // (e.g. same digest but different content like in the common crawl case)
  for (const entry of baseEntries) {
    if (entry.responseHeaders && entry.content) {
      const contentLength =
        getContentLengthHeader(entry.headerOutput) ??
        getContentLengthHeader(entry.rawResponseHeaders);
      if (contentLength !== undefined && entry.content.length !== contentLength) {
        // If the original content was gzip compressed, this could be the content-length of the compressed payload
        if (getHeaderValue(entry.headerOutput, "content-encoding") === "gzip") {
          const uncompressedLength = getUncompressedContentLength(entry.headerOutput);
          if (uncompressedLength === undefined && entry.downloadStatus === "digest-match") {
            // We have to redownload the actual file to verify the content in this case since we don't have the content-length of the compressed or uncompressed payload
            console.log(
              `Content length mismatch for ${entry.url} at ${entry.timestamp}, and content-encoding is gzip but no uncompressed content length header found. Redownloading the file to verify content...`,
            );
            const response = await fetchWaybackFile(
              entry.timestamp,
              entry.url,
              entry.statusCode ?? 0,
            );
            if (
              response.content.length !== contentLength ||
              entry.sha256 !== computeSha256(response.content)
            ) {
              // This should not really happen? Need to investigate manually if it does
              console.error(
                `Content mismatch for ${entry.url} at ${entry.timestamp} after redownloading: expected content length ${contentLength} and sha256 ${entry.sha256}, got content length ${response.content.length} and sha256 ${computeSha256(response.content)}`,
              );
              console.error(`Response headers: ${JSON.stringify(response.responseHeaders)}`);
              throw new Error(
                `Content mismatch for ${entry.url} at ${entry.timestamp} after redownloading: expected content length ${contentLength} and sha256 ${entry.sha256}, got content length ${response.content.length} and sha256 ${computeSha256(response.content)}`,
              );
            }
          } else if (
            uncompressedLength !== undefined &&
            entry.content.length !== uncompressedLength
          ) {
            // We have the content-length of the uncompressed payload and it doesn't match the actual uncompressed content length, so this is a mismatch as well
            console.error(
              `Content length mismatch for ${entry.url} at ${entry.timestamp}: expected uncompressed content length ${uncompressedLength}, got actual content length ${entry.content.length}`,
            );
            console.error(`Response headers: ${JSON.stringify(entry.responseHeaders)}`);
            throw new Error(
              `Content length mismatch for ${entry.url} at ${entry.timestamp}: expected uncompressed content length ${uncompressedLength}, got actual content length ${entry.content.length}`,
            );
          }
        } else {
          // This should not really happen? Need to investigate manually if it does
          console.error(
            `Content length mismatch for ${entry.url} at ${entry.timestamp}: expected ${contentLength}, got ${entry.content.length}`,
          );
          console.error(`Response headers: ${JSON.stringify(entry.responseHeaders)}`);
          throw new Error(
            `Content length mismatch for ${entry.url} at ${entry.timestamp}: expected ${contentLength}, got ${entry.content.length}`,
          );
        }
      }
    }
  }

  return { baseEntries, unavailableEntries, skippedEntries, metadata };
}
