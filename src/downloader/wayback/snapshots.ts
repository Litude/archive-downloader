import axios, { AxiosResponse } from "axios";
import { DownloadFileInput, UrlEntry } from "../../types/download-input-types.js";
import { CdxEntry, ExtendedCdxEntry } from "../../types/wayback-types.js";
import { filenameToString } from "../../file-name/file-name.js";
import {
  checkForLimitedCapture,
  filterLimitedCapturesForUrl,
} from "../../special-rules/limit-captures.js";
import { Context } from "../../types/context.js";
import {
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";
import { WaybackPrefetchedCdxIndex } from "./cdx-prefetch.js";
import { UrlMetadataFilteredEntries } from "../../file-output/url-metadata.js";
import { resolveDuplicateSnapshots } from "./duplicate-resolver.js";
import { TrailingSlashParsingMode } from "../../url/trailing-slash.js";
import { urlToUrlkey } from "../../url/urlkey.js";

const WAYBACK_CDX_API_URL = "http://web.archive.org/cdx/search/cdx";
const REQUEST_TIMEOUT = WAYBACK_REQUEST_TIMEOUT;

export async function getSnapshotsForWebsiteFile(
  input: DownloadFileInput,
  context: Context,
  waybackPrefetchedIndex?: WaybackPrefetchedCdxIndex,
): Promise<{
  validCdxEntries: ExtendedCdxEntry[];
  invalidCdxEntries: ExtendedCdxEntry[];
  unavailableCdxEntries: ExtendedCdxEntry[];
  metadata: UrlMetadataFilteredEntries;
}> {
  const includeInvalid = context.settings.includeInvalid ?? false;
  console.log(
    `Processing ${filenameToString(input.filename, "simple")} with output directory: ${input.outputDirectory}`,
  );

  const preliminaryResults: {
    snapshots: ExtendedCdxEntry[];
    url: UrlEntry;
  }[] = [];
  const unresolveableRevisits: {
    timestamps: string[];
    url: string;
  }[] = [];
  let allSnapshots: ExtendedCdxEntry[] = [];
  for (const url of input.urls) {
    const snapshots = await getSnapshotsForUrl(url, waybackPrefetchedIndex);
    const filteredSnapshots = snapshots.filter((snapshot) => snapshot.mimetype !== "warc/revisit");
    if (filteredSnapshots.length !== snapshots.length) {
      console.log(
        `Filtered out ${snapshots.length - filteredSnapshots.length} warc/revisit snapshots for ${url.url}`,
      );
      unresolveableRevisits.push({
        timestamps: snapshots.filter((s) => s.mimetype === "warc/revisit").map((s) => s.timestamp),
        url: url.url,
      });
    }
    preliminaryResults.push({ snapshots: filteredSnapshots, url });
    allSnapshots = [...allSnapshots, ...filteredSnapshots];
  }
  let validCdxEntries: ExtendedCdxEntry[] = [];
  let invalidCdxEntries: ExtendedCdxEntry[] = [];
  let unavailableCdxEntries: ExtendedCdxEntry[] = [];

  console.log(`Total snapshots found: ${allSnapshots.length}`);
  const limitedCaptureConfigs = checkForLimitedCapture(allSnapshots);
  if (limitedCaptureConfigs.length > 0) {
    console.log(
      `Found ${limitedCaptureConfigs.length} limited capture ranges that will be applied during postprocessing:`,
    );
    for (const config of limitedCaptureConfigs) {
      console.log(
        `- from ${config.startTimestamp} to ${config.endTimestamp} (captures per day: ${config.capturesPerDay}${config.mirrorCapturesPerDay ? `, for mirrors: ${config.mirrorCapturesPerDay}` : ""})`,
      );
    }
  }

  let limitedCaptureFiltered = 0;
  let redirectNonSlashTotal = 0;
  let duplicateFiltered = 0;

  for (const { snapshots, url } of preliminaryResults) {
    console.log(`Postprocessing ${url.url}`);
    const {
      uniqueSnapshots,
      duplicateFiltered: dupeFiltered,
      slashModeMismatchFiltered: redirectNonSlashFiltered,
      limitedCaptureFiltered: dupeLimitCapture,
    } = await resolveDuplicateSnapshots({
      requestUrl: url.url,
      slashMode: url.trailingSlashParsingMode ?? TrailingSlashParsingMode.Lax,
      snapshots,
      limitedCaptures: limitedCaptureConfigs,
      context,
    });
    const unavailableOtherUniqueEntries = uniqueSnapshots.filter((s) => s.unavailable);
    const availableUniqueSnapshots = uniqueSnapshots.filter((s) => !s.unavailable);
    redirectNonSlashTotal += redirectNonSlashFiltered;
    limitedCaptureFiltered += dupeLimitCapture;
    duplicateFiltered += dupeFiltered;
    let validSnapShots = availableUniqueSnapshots.filter((snapshot) =>
      snapshot.status?.toString().startsWith("2"),
    );
    let invalidSnapshots = availableUniqueSnapshots.filter(
      (snapshot) => !snapshot.status?.toString().startsWith("2"),
    );
    console.log(`Found ${validSnapShots.length} valid snapshots for ${url.url}`);
    if (invalidSnapshots.length > 0) {
      console.log(`Found ${invalidSnapshots.length} invalid snapshots for ${url.url}`);
    }
    if (dupeFiltered > 0) {
      console.log(`Removed ${dupeFiltered} duplicate invalid snapshots for ${url.url}`);
    }

    const originalValidCount = validSnapShots.length;
    validSnapShots = filterLimitedCapturesForUrl(
      validSnapShots,
      limitedCaptureConfigs,
      url.mirrorUrl,
    );
    if (validSnapShots.length !== originalValidCount) {
      console.log(
        `Filtered ${originalValidCount - validSnapShots.length} snapshots for ${url.url} based on limited captures.`,
      );
      limitedCaptureFiltered += originalValidCount - validSnapShots.length;
    }
    const originalInvalidCount = invalidSnapshots.length;
    invalidSnapshots = filterLimitedCapturesForUrl(
      invalidSnapshots,
      limitedCaptureConfigs,
      url.mirrorUrl,
    );
    if (invalidSnapshots.length !== originalInvalidCount) {
      console.log(
        `Filtered ${originalInvalidCount - invalidSnapshots.length} invalid snapshots for ${url.url} based on limited captures.`,
      );
      limitedCaptureFiltered += originalInvalidCount - invalidSnapshots.length;
    }
    validCdxEntries = [...validCdxEntries, ...validSnapShots];
    invalidCdxEntries = [...invalidCdxEntries, ...invalidSnapshots];
    unavailableCdxEntries = [...unavailableCdxEntries, ...unavailableOtherUniqueEntries];
  }
  console.log(
    `Total valid snapshots for ${filenameToString(input.filename, "simple")}: ${validCdxEntries.length}`,
  );
  if (includeInvalid) {
    console.log(
      `Total invalid snapshots for ${filenameToString(input.filename, "simple")}: ${invalidCdxEntries.length}`,
    );
  }
  return {
    validCdxEntries: validCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    invalidCdxEntries: invalidCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    unavailableCdxEntries,
    metadata: {
      duplicateTimestampsRemoved: duplicateFiltered ? duplicateFiltered : undefined,
      limitedCaptureRanges: limitedCaptureFiltered
        ? {
            configs: limitedCaptureConfigs,
            count: limitedCaptureFiltered,
          }
        : undefined,
      trailingSlashMismatchesRemoved: redirectNonSlashTotal ? redirectNonSlashTotal : undefined,
      unresolvableRevisits:
        unresolveableRevisits.length > 0
          ? {
              entries: unresolveableRevisits,
              count: unresolveableRevisits.reduce((sum, item) => sum + item.timestamps.length, 0),
            }
          : undefined,
    },
  };
}

function filterPrefetchedWaybackEntries(
  cachedEntries: ExtendedCdxEntry[],
  url: UrlEntry,
): ExtendedCdxEntry[] {
  const targetUrlkey = urlToUrlkey(url.url);
  return cachedEntries
    .filter((entry) => {
      if (entry.urlkey !== targetUrlkey) {
        return false;
      }
      if (url.maxTimestamp && entry.timestamp > url.maxTimestamp) {
        return false;
      }
      if (url.minTimestamp && entry.timestamp < url.minTimestamp) {
        return false;
      }
      return true;
    })
    .map((entry) => ({ ...entry, requestUrl: url.url }));
}

function validateCdxEntryFieldMatch(first: CdxEntry, second: CdxEntry, field: keyof CdxEntry) {
  if (first[field] !== second[field]) {
    throw new Error(
      `CDX entries with same timestamp have different ${field} values, which should not happen. Timestamp: ${first.timestamp}, URL: ${first.url}, value1: ${first[field]}, value2: ${second[field]}`,
    );
  }
}

async function getSnapshotsForUrl(url: UrlEntry, prefetchedIndex?: WaybackPrefetchedCdxIndex) {
  let filteredSnapshots: ExtendedCdxEntry[];

  if (prefetchedIndex) {
    for (const [prefix, cachedData] of prefetchedIndex) {
      if (!urlToUrlkey(url.url).startsWith(urlToUrlkey(prefix))) {
        continue;
      }
      if (cachedData.minTimestamp && !url.minTimestamp) {
        console.log(
          `Skipping pre-fetched Wayback CDX index for ${url.url} (prefix: ${prefix}): index minTimestamp ${cachedData.minTimestamp} but request has no minTimestamp.`,
        );
        continue;
      }
      if (cachedData.maxTimestamp && !url.maxTimestamp) {
        console.log(
          `Skipping pre-fetched Wayback CDX index for ${url.url} (prefix: ${prefix}): index maxTimestamp ${cachedData.maxTimestamp} but request has no maxTimestamp.`,
        );
        continue;
      }
      if (
        url.minTimestamp &&
        cachedData.minTimestamp &&
        cachedData.minTimestamp > url.minTimestamp
      ) {
        console.log(
          `Skipping pre-fetched Wayback CDX index for ${url.url} (prefix: ${prefix}): index minTimestamp ${cachedData.minTimestamp} > request minTimestamp ${url.minTimestamp}.`,
        );
        continue;
      }
      if (
        url.maxTimestamp &&
        cachedData.maxTimestamp &&
        cachedData.maxTimestamp < url.maxTimestamp
      ) {
        console.log(
          `Skipping pre-fetched Wayback CDX index for ${url.url} (prefix: ${prefix}): index maxTimestamp ${cachedData.maxTimestamp} < request maxTimestamp ${url.maxTimestamp}.`,
        );
        continue;
      }
      filteredSnapshots = filterPrefetchedWaybackEntries(cachedData.entries, url);
      console.log(
        `Using pre-fetched Wayback CDX index for ${url.url} (prefix: ${prefix}), found ${filteredSnapshots.length} entries.`,
      );
      const revisitCount = filteredSnapshots.filter((s) => s.mimetype === "warc/revisit").length;
      if (revisitCount > 0) {
        console.log(
          `Found ${revisitCount} warc/revisit snapshots for ${url.url}. Will resolve revisits.`,
        );
        const resolvedSnapshots = await fetchWaybackCdxIndex(url.url, true);
        const filteredResolvedSnapshots = filterSnapshotsByTimestamp(
          resolvedSnapshots,
          url.maxTimestamp,
          url.minTimestamp,
        );
        if (filteredResolvedSnapshots.length !== filteredSnapshots.length) {
          throw new Error(
            `Unexpectedly found a different number of snapshots when fetching with resolve revisits (got ${filteredResolvedSnapshots.length}, expected ${filteredSnapshots.length}) for ${url.url}.`,
          );
        }
        filteredSnapshots.forEach((snapshot, index) => {
          if (snapshot.mimetype === "warc/revisit") {
            const resolvedSnapshot = filteredResolvedSnapshots[index];
            validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "timestamp");
            validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "url");
            validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "digest");
            validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "length");
            filteredSnapshots![index] = {
              ...resolvedSnapshot,
              revisitEntry: snapshot,
            };
          }
        });
      }
      return filteredSnapshots;
    }
  }

  const allSnapshots = await fetchWaybackCdxIndex(url.url, false);
  console.log(`Found ${allSnapshots.length} total snapshots for ${url.url}.`);
  filteredSnapshots = filterSnapshotsByTimestamp(allSnapshots, url.maxTimestamp, url.minTimestamp);
  if (filteredSnapshots.length !== allSnapshots.length) {
    console.log(
      `Filtered ${allSnapshots.length - filteredSnapshots.length} snapshots for ${url.url} based on timestamp constraints`,
    );
  }
  const revisitCount = filteredSnapshots.filter((s) => s.mimetype === "warc/revisit").length;
  if (revisitCount > 0) {
    console.log(
      `Found ${revisitCount} warc/revisit snapshots for ${url.url}. Will resolve revisits.`,
    );
    const resolvedSnapshots = await fetchWaybackCdxIndex(url.url, true);
    const filteredResolvedSnapshots = filterSnapshotsByTimestamp(
      resolvedSnapshots,
      url.maxTimestamp,
      url.minTimestamp,
    );
    if (filteredResolvedSnapshots.length !== filteredSnapshots.length) {
      throw new Error(
        `Unexpectedly found a different number of snapshots when fetching with resolve revisits (got ${filteredResolvedSnapshots.length}, expected ${filteredSnapshots.length}) for ${url.url}.`,
      );
    }
    filteredSnapshots.forEach((snapshot, index) => {
      if (snapshot.mimetype === "warc/revisit") {
        const resolvedSnapshot = filteredResolvedSnapshots[index];
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "timestamp");
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "url");
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "digest");
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, "length");
        filteredSnapshots[index] = {
          ...resolvedSnapshot,
          revisitEntry: snapshot,
        };
      }
    });
  }

  return filteredSnapshots;
}

function filterSnapshotsByTimestamp(
  snapshots: ExtendedCdxEntry[],
  maxTimestamp?: string,
  minTimestamp?: string,
) {
  return snapshots.filter((snapshot) => {
    if (maxTimestamp && snapshot.timestamp > maxTimestamp) {
      return false;
    }
    if (minTimestamp && snapshot.timestamp < minTimestamp) {
      return false;
    }
    return true;
  });
}

// This will attempt to fetch the CDX index for a given URL, with retries and exponential backoff
// It will attempt to fetch the index until successful
async function fetchWaybackCdxIndex(
  url: string,
  resolveRevisits: boolean,
): Promise<ExtendedCdxEntry[]> {
  let attempt = 1;
  let backoff = WAYBACK_INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(
        `Fetching CDX index${resolveRevisits ? " with resolve revisits" : ""} for ${url} (attempt ${attempt})...`,
      );
      const params = {
        url,
        output: "json",
        fl: "timestamp,original,statuscode,digest,mimetype,length,urlkey,filename,offset",
        resolveRevisits: resolveRevisits ? "true" : "false",
      };
      const response: AxiosResponse<string[][]> = await axios.get(WAYBACK_CDX_API_URL, {
        params,
        timeout: REQUEST_TIMEOUT,
      });
      const data = response.data;
      const snapshots: ExtendedCdxEntry[] = data.slice(1).map((row) => ({
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
        requestUrl: url,
      }));
      return snapshots;
    } catch (e) {
      console.log(`Error fetching CDX index for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
      attempt++;
    }
  }
}
