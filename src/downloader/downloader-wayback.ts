import { getSnapshotsForWebsiteFile } from "./wayback/snapshots.js";
import { computeSha256, computeWaybackDigest } from "../utils/hash.js";
import { classifyEntry } from "../classification/classifier.js";
import { DownloadedFile } from "../types/download-types.js";
import { parseHeaderTimestamps } from "../utils/timestamp.js";
import {
  downloadUniqueDigestsForSnapshots,
  fetchWaybackFileHeaders,
} from "./wayback/file-download.js";
import {
  addValidationError,
  CaptureClassification,
  CaptureEntry,
  CaptureWaybackMetadata,
  Classification,
} from "../types/capture-types.js";
import { getWaybackFilename } from "../utils/wayback-filename.js";
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
import { parseArcFile } from "../archive-record/arc.js";
import { parseWarcFile } from "../archive-record/warc.js";
import { cleanupWaybackHeaders } from "../file-output/header-output.js";
import { parseWarcinfoFile } from "../archive-record/warcinfo.js";
import { getHeaderValue } from "../headers/headers.js";
import { tryToCompleteMissingCdxFields } from "./wayback/cdx-completion/cdx-completion.js";
import { cleanUpCorruptCommonCrawlEntries } from "./wayback/wayback-commoncrawl-cleanup.js";

function computeDigestHashes(uniqueDigestFiles: Map<string, DownloadedFile>) {
  const digestHashes = new Map<string, { sha256: string; actualDigest: string }>();

  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const sha256 = computeSha256(file.content);
    const actualDigest = computeWaybackDigest(file.content);
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

function getArchivedRecord(entry: CaptureEntry) {
  if (entry.records) {
    const arcRecord = entry.records.find((record) => record.type === "arc");
    if (arcRecord) {
      return parseArcFile(arcRecord.content);
    }
    const warcRecord = entry.records.find((record) => record.type === "warc");
    if (warcRecord) {
      return parseWarcFile(warcRecord.content);
    }
  }
  return null;
}

export async function downloadWaybackEntries(input: DownloadFileInput, context: Context) {
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
          ? parseHeaderTimestamps(entry.url, headers, entry.timestamp, true)
          : {
              captureDate: DateTime.fromFormat(entry.timestamp, "yyyyLLddHHmmss", {
                zone: "utc",
              }) as DateTime<true>,
              lastModified: null,
              mementoDate: null,
              serverDate: null,
            };
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
          mimetype: entry.mimetype,
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
        mimetype: entry.mimetype,
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
      const timestamps = parseHeaderTimestamps(
        entry.url,
        response.responseHeaders,
        entry.timestamp,
        true,
      );
      const waybackFilename = getWaybackFilename(response.responseHeaders);
      const existingEntry = baseEntries.find(
        (e) => e.url === entry.url && e.timestamp === entry.timestamp,
      );
      if (!existingEntry) {
        throw new Error(`Existing entry for ${entry.url} at ${entry.timestamp} not found?!`);
      }
      const contentLength = response.responseHeaders["content-length"]
        ? parseInt(response.responseHeaders["content-length"])
        : undefined;
      if (contentLength !== undefined && existingEntry.content?.length !== contentLength) {
        throw new Error(
          `Content length mismatch for ${entry.url} at ${entry.timestamp}: expected ${contentLength}, got ${existingEntry.content?.length}`,
        );
      }
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
          const collections = [];
          const collectionIds = Array.isArray(metadata.collection)
            ? metadata.collection
            : [metadata.collection];
          for (const collectionId of collectionIds) {
            if (collectionId === "web") {
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
                title: "",
                description: "",
              });
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
              numPages: metadata.imagecount ? parseInt(metadata.imagecount) : undefined,
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
      entry.headerOutput = {
        original: record.headers,
      };
      const recordSha256 = computeSha256(record.content);
      if (entry.sha256 && recordSha256 !== entry.sha256) {
        addValidationError(entry, "record-content-mismatch", {
          recordSha256,
          entrySha256: entry.sha256,
        });
      }
      if (record.status !== entry.statusCode) {
        addValidationError(entry, "record-status-mismatch", {
          recordStatus: record.status,
          entryStatus: entry.statusCode,
        });
      }
      if (record.timestamp !== entry.captureTimestamp.toISO({ suppressMilliseconds: true })) {
        addValidationError(entry, "record-timestamp-mismatch", {
          recordTimestamp: record.timestamp,
          entryTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
        });
      }
      if (record.url !== entry.url) {
        addValidationError(entry, "record-url-mismatch", {
          recordUrl: record.url,
          entryUrl: entry.url,
        });
      }
    } else if (entry.responseHeaders && entry.rawResponseHeaders) {
      entry.headerOutput = cleanupWaybackHeaders(
        entry.url,
        entry.responseHeaders,
        entry.rawResponseHeaders,
        input.filename,
      );
    }

    if (
      entry.mementoDateTime &&
      entry.mementoDateTime.toMillis() !== entry.captureTimestamp.toMillis()
    ) {
      addValidationError(entry, "memento-timestamp-mismatch", {
        mementoDateTime: entry.mementoDateTime.toISO({ suppressMilliseconds: true }),
        captureTimestamp: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      });
    }

    const warcInfo = entry.records
      ? entry.records.find((record) => record.type === "warcinfo")
      : undefined;
    if (warcInfo) {
      const warcInfoMetadata = parseWarcinfoFile(warcInfo.content);
      const software = getHeaderValue(warcInfoMetadata.lines, "software");
      const isPartOf = getHeaderValue(warcInfoMetadata.lines, "isPartOf");
      const description = getHeaderValue(warcInfoMetadata.lines, "description");
      const publisher = getHeaderValue(warcInfoMetadata.lines, "publisher");
      const operator = getHeaderValue(warcInfoMetadata.lines, "operator");
      if (software || isPartOf || description || publisher || operator) {
        if (!entry.metadata) {
          entry.metadata = {};
        }
        if (!entry.metadata.crawlData) {
          entry.metadata.crawlData = {
            crawler: software,
            crawljob: isPartOf,
            publisher,
            operator,
            description,
          };
        }
      }
    }
  }
  await tryToCompleteMissingCdxFields(baseEntries);

  // Post-cleanup: Need to check for possibly corrupt commoncrawl entries
  await cleanUpCorruptCommonCrawlEntries(baseEntries, input.classifications);

  return { baseEntries, unavailableEntries, skippedEntries, metadata };
}
