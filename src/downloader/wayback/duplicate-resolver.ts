import { LimitedCaptureRange } from "../../types/download-input-types.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { isDefined } from "../../utils/ts-utils.js";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF } from "./wayback-common.js";
import { fetchWaybackFileHeaders } from "./file-download.js";
import { DownloadedFile } from "../../types/download-types.js";
import { parseWaybackLinkHeader } from "./utils/wayback-link.js";
import { Context } from "../../types/context.js";
import { isUrlTrailingSlashMatch, TrailingSlashParsingMode } from "../../url/trailing-slash.js";

function getMergedSnapshot(snapshotsAtTimestamp: ExtendedCdxEntry[]): ExtendedCdxEntry {
  const mergedSnapshot = { ...snapshotsAtTimestamp[0] };
  const uniqueDigests = new Set(snapshotsAtTimestamp.map((s) => s.digest));
  const uniqueSize = new Set(snapshotsAtTimestamp.map((s) => s.length));
  // If the digest or size is different between the snapshots, we can't be sure which one is the correct one, so we will clear the digest and size to indicate that the values are unknown.
  if (uniqueDigests.size > 1) {
    mergedSnapshot.digest = undefined;
  }
  if (uniqueSize.size > 1) {
    mergedSnapshot.length = undefined;
  }
  return mergedSnapshot;
}

function getMergedSnapshotForShadowedEntries(
  snapshotsAtTimestamp: ExtendedCdxEntry[],
): ExtendedCdxEntry | null {
  const mergedSnapshot: ExtendedCdxEntry = { ...snapshotsAtTimestamp[0], unavailable: true };
  const uniqueDigests = new Set(snapshotsAtTimestamp.map((s) => s.digest));
  const uniqueSize = new Set(snapshotsAtTimestamp.map((s) => s.length));
  const uniqueUrlPathsNormalized = new Set(
    snapshotsAtTimestamp.map((s) => {
      const urlObj = new URL(s.url);
      return urlObj.pathname.toLowerCase();
    }),
  );
  // If the digest or size is different between the snapshots, we can't be sure which one is the correct one, so we will clear the digest and size to indicate that the values are unknown.
  if (uniqueDigests.size > 1) {
    mergedSnapshot.digest = undefined;
  }
  if (uniqueSize.size > 1) {
    mergedSnapshot.length = undefined;
  }
  if (uniqueUrlPathsNormalized.size > 1) {
    return null;
  }
  return mergedSnapshot;
}

function handleDuplicateCapture({
  requestUrl,
  duplicateUrlParsingMode,
  response,
  potentialDuplicates,
}: {
  requestUrl: string;
  duplicateUrlParsingMode: TrailingSlashParsingMode;
  response?: {
    statusCode: number;
    originalUrl: string;
  };
  potentialDuplicates: ExtendedCdxEntry[];
}): {
  resolvedSnapshot: ExtendedCdxEntry | null; // only null if filtering mode makes this a non match
  unavailableOtherUniqueEntries: ExtendedCdxEntry[];
  // this should take precedence over filteredDuplicateEntries, meaning that if a filtered entry had a non matching slash mode it should not be counted as a filtered duplicate
  filteredSlashModeEntries: number;
  filteredDuplicateEntries: number;
} {
  // We can pre-calculate the amount of entries that would be filtered by the slash mode
  const filteredSlashModeEntryCount = potentialDuplicates.filter(
    (entry) =>
      !isUrlTrailingSlashMatch(entry.url, requestUrl, duplicateUrlParsingMode, entry.status ?? 0),
  ).length;

  let finalMatchingSnapShot: ExtendedCdxEntry | null = null;
  if (response) {
    // We first lookup the entry that matches the response status code and original URL
    const matchingEntries = potentialDuplicates.filter(
      (entry) => entry.status === response.statusCode && entry.url === response.originalUrl,
    );
    if (matchingEntries.length === 0) {
      throw new Error(
        `No matching CDX entries found for capture with status ${response.statusCode} and original URL ${response.originalUrl}?!`,
      );
    }
    const matchingSnapShot = getMergedSnapshot(matchingEntries);
    // But if the URL does not match our requested slash mode, we set the response to null
    finalMatchingSnapShot = isUrlTrailingSlashMatch(
      matchingSnapShot.url,
      requestUrl,
      duplicateUrlParsingMode,
      matchingSnapShot.status ?? 0,
    )
      ? matchingSnapShot
      : null;
  }

  // Then we return one unique entry per status code among the potential duplicates that do not match the response status code
  // These should be considered unavailable
  // Wayback responses return the original URL and statuscode, so based on those we could theoretically distinguish between multiple
  // captures. The digest is not returned and even though it could be calculated, it does not always match the digest in the CDX, so
  // it is not a reliable way to match captures. The size of offset fields are not returned either, so we group by status code and
  // original URL and return one entry per unique combination of those that does not match the response status code and original URL.
  const groupedNonMatchingEntryKeys = [
    ...new Set(
      potentialDuplicates
        .map((entry) => `${entry.status}-${entry.url}`)
        .filter((key) => key !== `${response?.statusCode}-${response?.originalUrl}`),
    ),
  ];
  const unavailableOtherUniqueEntries = groupedNonMatchingEntryKeys
    .map((key) => {
      const [status, url] = [key.slice(0, key.indexOf("-")), key.slice(key.indexOf("-") + 1)];
      const entriesWithStatus = potentialDuplicates.filter(
        (entry) => entry.status === Number(status) && entry.url === url,
      );
      const mergedEntry = getMergedSnapshotForShadowedEntries(entriesWithStatus);
      return mergedEntry;
    })
    .filter(isDefined)
    .filter((entry) =>
      isUrlTrailingSlashMatch(entry.url, requestUrl, duplicateUrlParsingMode, entry.status ?? 0),
    );

  const duplicateFilteredCount =
    potentialDuplicates.length -
    filteredSlashModeEntryCount -
    unavailableOtherUniqueEntries.length -
    (finalMatchingSnapShot ? 1 : 0);

  return {
    resolvedSnapshot: finalMatchingSnapShot,
    unavailableOtherUniqueEntries: unavailableOtherUniqueEntries,
    filteredSlashModeEntries: filteredSlashModeEntryCount,
    filteredDuplicateEntries: duplicateFilteredCount,
  };
}

async function fetchHeadersUntilSuccess(
  timestamp: string,
  url: string,
  statusCodes: number[],
  allow404: boolean,
  context: Context,
): Promise<Omit<DownloadedFile, "content" | "corrupt">> {
  let attempt = 1;
  // Redirects might not resolve to the actual capture, so we might not actually get x-archive-src.
  // Hopefully such timestamps that also have 200 captures would always resolve to the 200 capture or other code
  const potentialRedirect = statusCodes.some((code) => [301, 302].includes(code));
  const allRedirect = statusCodes.every((code) => [301, 302].includes(code));
  const maxRedirectAttempts = allRedirect ? 5 : potentialRedirect ? 15 : 0; // Only attempt retries for missing x-archive-src if there is a potential redirect, otherwise it is likely an actual issue
  let redirectAttempts = 1;
  let redirectBackoff = WAYBACK_INITIAL_BACKOFF;
  let error404Attempts = 0;
  while (true) {
    try {
      const result = await fetchWaybackFileHeaders(timestamp, url);
      if (result.responseHeaders["x-archive-src"]) {
        return result;
      }
      if (
        context.settings.skipOn302 &&
        attempt >= context.settings.skipOn302 &&
        result.statusCode === 302
      ) {
        return result;
      }
      if (!allRedirect && !potentialRedirect) {
        throw new Error(
          `Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}`,
        );
      } else if (result.statusCode === 302 && redirectAttempts < maxRedirectAttempts) {
        console.log(
          `Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}, this ${allRedirect ? "redirect only" : "potential redirect"} capture might be unavailable. Retrying in ${redirectBackoff / 1000}s... (attempt ${redirectAttempts})`,
        );
        await new Promise((res) => setTimeout(res, redirectBackoff));
        redirectBackoff = Math.min(redirectBackoff * 2, WAYBACK_MAX_BACKOFF);
        redirectAttempts++;
      } else if (allow404 && result.statusCode === 404) {
        ++error404Attempts;
        if (error404Attempts >= 3) {
          console.log(
            `Received 404 status code when fetching headers for ${timestamp}-${url} multiple times, but skipping due to settings.`,
          );
          return result;
        }
        throw new Error(
          `Received 404 status code when fetching headers for ${timestamp}-${url}, will attempt for ${3 - error404Attempts} more times before skipping.`,
        );
      } else {
        return result;
      }
    } catch (error) {
      console.log(
        `Error fetching headers for ${timestamp}-${url}: ${error}, (attempt ${attempt}) retrying in 30s...`,
      );
      await new Promise((res) => setTimeout(res, 30000));
      attempt++;
    }
  }
}

export async function resolveDuplicateSnapshots({
  requestUrl,
  slashMode,
  snapshots,
  limitedCaptures,
  context,
}: {
  requestUrl: string;
  slashMode: TrailingSlashParsingMode;
  snapshots: ExtendedCdxEntry[];
  limitedCaptures: LimitedCaptureRange[];
  context: Context;
}): Promise<{
  uniqueSnapshots: ExtendedCdxEntry[];
  limitedCaptureFiltered: number;
  duplicateFiltered: number;
  slashModeMismatchFiltered: number;
}> {
  // Group snapshots by timestamp to handle duplicates
  const snapshotsByTimestamp = new Map<string, ExtendedCdxEntry[]>();
  let duplicateFiltered = 0;
  for (const snapshot of snapshots) {
    const timestamp = snapshot.timestamp;
    if (!snapshotsByTimestamp.has(timestamp)) {
      snapshotsByTimestamp.set(timestamp, []);
    }
    snapshotsByTimestamp.get(timestamp)!.push(snapshot);
  }
  let limitedCaptureFiltered = 0;
  let slashModeMismatchFiltered = 0;

  const uniqueSnapshots: ExtendedCdxEntry[] = [];
  const anyNonRedirectSnapshot = snapshots.some((s) => !s.status?.toString().startsWith("3"));

  // For each timestamp, check if there are multiple snapshots. If so, we need to resolve which one is the correct one by fetching the headers and comparing the status codes
  for (const [timestamp, snapshotsAtTimestamp] of snapshotsByTimestamp) {
    if (snapshotsAtTimestamp.length === 1) {
      if (
        !isUrlTrailingSlashMatch(
          snapshotsAtTimestamp[0].url,
          requestUrl,
          slashMode,
          snapshotsAtTimestamp[0].status ?? 0,
        )
      ) {
        slashModeMismatchFiltered++;
      } else {
        uniqueSnapshots.push(snapshotsAtTimestamp[0]);
      }
    } else {
      // A performance optimization: If the duplicate falls inside a limited capture range, we won't even try resolving it and just filter out all duplicates here
      // We do this because the limited capture range has tons of captures and most will be filtered out, so these duplicates hardly matter
      // and can be filtered out
      if (limitedCaptures.length > 0) {
        const inLimitedCapture = limitedCaptures.some(
          (range) => timestamp >= range.startTimestamp && timestamp <= range.endTimestamp,
        );
        if (inLimitedCapture) {
          const slashNonMatchCount = snapshotsAtTimestamp.filter(
            (s) => !isUrlTrailingSlashMatch(s.url, requestUrl, slashMode, s.status ?? 0),
          ).length;
          slashModeMismatchFiltered += slashNonMatchCount;
          limitedCaptureFiltered += snapshotsAtTimestamp.length - slashNonMatchCount;
          continue;
        }
      }

      const potentialSnapshot = snapshotsAtTimestamp[0];
      const allSameStatusAndUrl = snapshotsAtTimestamp.every(
        (s) => s.status === potentialSnapshot.status && s.url === potentialSnapshot.url,
      );
      if (allSameStatusAndUrl) {
        console.log(
          `Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp}-${potentialSnapshot.url}. All snapshots have the same status code ${potentialSnapshot.status} and url, no need to fetch headers to resolve.`,
        );
        const snapshot = getMergedSnapshot(snapshotsAtTimestamp);
        if (isUrlTrailingSlashMatch(snapshot.url, requestUrl, slashMode, snapshot.status ?? 0)) {
          uniqueSnapshots.push(snapshot);
        } else {
          slashModeMismatchFiltered += snapshotsAtTimestamp.length;
        }
      } else {
        console.log(
          `Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} (status codes ${snapshotsAtTimestamp.map((s) => s.status).join(", ")}). Attempting to resolve by fetching headers...`,
        );
        const possibleStatusCodes = [
          ...new Set(snapshotsAtTimestamp.map((s) => s.status).filter(isDefined)),
        ];
        const actualSnapShot = snapshotsAtTimestamp[0];
        const result = await fetchHeadersUntilSuccess(
          timestamp,
          actualSnapShot.url,
          possibleStatusCodes,
          anyNonRedirectSnapshot,
          context,
        );

        const isValidResult = !!result.responseHeaders["x-archive-src"];
        let response: { statusCode: number; originalUrl: string } | undefined = undefined;
        if (isValidResult) {
          const originalUrl = parseWaybackLinkHeader(result.responseHeaders["link"]).find(
            (link) => link.rel === "original",
          )?.url;
          if (!originalUrl) {
            throw new Error(
              `Missing original URL in Link header when fetching headers for ${timestamp}-${actualSnapShot.url}`,
            );
          }
          response = {
            statusCode: result.statusCode,
            originalUrl,
          };
        }
        const duplicateResponse = handleDuplicateCapture({
          requestUrl,
          duplicateUrlParsingMode: slashMode,
          response,
          potentialDuplicates: snapshotsAtTimestamp,
        });
        if (duplicateResponse.filteredSlashModeEntries) {
          slashModeMismatchFiltered += duplicateResponse.filteredSlashModeEntries;
        }
        if (duplicateResponse.filteredDuplicateEntries) {
          duplicateFiltered += duplicateResponse.filteredDuplicateEntries;
        }
        if (duplicateResponse.resolvedSnapshot) {
          console.log(
            `Resolved duplicate snapshots for ${timestamp}-${actualSnapShot.url}: status ${actualSnapShot.status}`,
          );
          uniqueSnapshots.push(duplicateResponse.resolvedSnapshot);
        }
        if (duplicateResponse.unavailableOtherUniqueEntries.length > 0) {
          console.log(
            `Found ${duplicateResponse.unavailableOtherUniqueEntries.length} unique snapshots with different status code and url combination that are considered unavailable for ${timestamp}-${actualSnapShot.url}`,
          );
        }
        uniqueSnapshots.push(...duplicateResponse.unavailableOtherUniqueEntries);
      }
    }
  }
  if (limitedCaptureFiltered > 0) {
    console.log(
      `Filtered out ${limitedCaptureFiltered} snapshots that fell inside limited capture ranges without attempting to resolve duplicates.`,
    );
  }
  if (duplicateFiltered > 0) {
    console.log(`Filtered out ${duplicateFiltered} total duplicate snapshots based on timestamp.`);
  }
  if (slashModeMismatchFiltered > 0) {
    console.log(
      `Filtered out ${slashModeMismatchFiltered} snapshots that did not match the trailing slash mode.`,
    );
  }
  return { uniqueSnapshots, limitedCaptureFiltered, duplicateFiltered, slashModeMismatchFiltered };
}
