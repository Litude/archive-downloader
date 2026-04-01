import { LimitedCaptureRange } from "../../types/download-input-types.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { fetchWaybackFileHeaders } from "./file-download.js";
import { DownloadedFile } from "../../types/download-types.js";
import { Context } from "../../types/context.js";
import { isDefined } from "../../utils/ts-utils.js";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF } from "./wayback-common.js";

export function isUrlSlashMatch(url1: string, url2: string): boolean {
  const urlObj1 = new URL(url1);
  const urlObj2 = new URL(url2);
  return urlObj1.pathname.toLowerCase() === urlObj2.pathname.toLowerCase();
}

const INITIAL_BACKOFF = WAYBACK_INITIAL_BACKOFF;
const MAX_BACKOFF = WAYBACK_MAX_BACKOFF;

// Redirects and not found are the most likely codes when a page no longer exists
const INVALID_ALLOWED_STATUS_CODES = [301, 302, 303, 304, 307, 308, 403, 404];

async function fetchHeadersUntilSuccess(
  timestamp: string,
  url: string,
  statusCodes: number[],
  context: Context,
): Promise<Omit<DownloadedFile, "content" | "corrupt">> {
  let attempt = 1;
  // Redirects might not resolve to the actual capture, so we might not actually get x-archive-src.
  // Hopefully such timestamps that also have 200 captures would always resolve to the 200 capture or other code
  const potentialRedirect = statusCodes.some((code) => [301, 302].includes(code));
  const allRedirect = statusCodes.every((code) => [301, 302].includes(code));
  const maxRedirectAttempts = allRedirect ? 5 : potentialRedirect ? 15 : 0; // Only attempt retries for missing x-archive-src if there is a potential redirect, otherwise it is likely an actual issue
  let redirectAttempts = 1;
  let redirectBackoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const result = await fetchWaybackFileHeaders(timestamp, url);
      if (context.settings.skipOn302) {
        return result;
      }
      if (result.responseHeaders["x-archive-src"] === undefined) {
        if (!allRedirect && !potentialRedirect) {
          throw new Error(
            `Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}`,
          );
        } else if (redirectAttempts < maxRedirectAttempts && result.statusCode === 302) {
          console.log(
            `Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}, this ${allRedirect ? "redirect only" : "potential redirect"} capture might be unavailable. Retrying in ${redirectBackoff / 1000}s... (attempt ${redirectAttempts})`,
          );
          await new Promise((res) => setTimeout(res, redirectBackoff));
          redirectBackoff = Math.min(redirectBackoff * 2, MAX_BACKOFF);
          redirectAttempts++;
        } else {
          return result;
        }
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

function getMergedSnapshot(snapshotsAtTimestamp: ExtendedCdxEntry[]): ExtendedCdxEntry {
  const mergedSnapshot = { ...snapshotsAtTimestamp.at(-1)! };
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

async function resolveDuplicateSnapshots(
  snapshots: ExtendedCdxEntry[],
  limitedCaptures: LimitedCaptureRange[],
  context: Context,
): Promise<{
  uniqueSnapshots: ExtendedCdxEntry[];
  limitedCaptureFiltered: number;
  filteredSnapshots: number;
}> {
  // Group snapshots by timestamp to handle duplicates
  const snapshotsByTimestamp = new Map<string, ExtendedCdxEntry[]>();
  let filteredSnapshots = 0;
  for (const snapshot of snapshots) {
    const timestamp = snapshot.timestamp;
    if (!snapshotsByTimestamp.has(timestamp)) {
      snapshotsByTimestamp.set(timestamp, []);
    }
    snapshotsByTimestamp.get(timestamp)!.push(snapshot);
  }
  let limitedCaptureFiltered = 0;

  const uniqueSnapshots: ExtendedCdxEntry[] = [];

  // For each timestamp, check if there are multiple snapshots. If so, we need to resolve which one is the correct one by fetching the headers and comparing the status codes
  for (const [timestamp, snapshotsAtTimestamp] of snapshotsByTimestamp) {
    if (snapshotsAtTimestamp.length === 1) {
      uniqueSnapshots.push(snapshotsAtTimestamp[0]);
    } else {
      // A performance optimization: If the duplicate falls inside a limited capture range, we won't even try resolving it and just filter out all duplicates here
      if (limitedCaptures.length > 0) {
        const inLimitedCapture = limitedCaptures.some(
          (range) => timestamp >= range.startTimestamp && timestamp <= range.endTimestamp,
        );
        if (inLimitedCapture) {
          limitedCaptureFiltered += snapshotsAtTimestamp.length;
          filteredSnapshots += snapshotsAtTimestamp.length;
          continue;
        }
      }

      const potentialSnapshot = snapshotsAtTimestamp.at(-1)!;
      const allSameStatus = snapshotsAtTimestamp.every(
        (s) => s.status === potentialSnapshot.status,
      );
      if (allSameStatus) {
        console.log(
          `Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url}. All snapshots have the same status code ${potentialSnapshot.status} for ${potentialSnapshot.url} at ${timestamp}, no need to fetch headers to resolve.`,
        );
        const snapshot = getMergedSnapshot(snapshotsAtTimestamp);
        uniqueSnapshots.push(snapshot);
        filteredSnapshots += snapshotsAtTimestamp.length - 1;
      } else {
        console.log(
          `Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} (status codes ${snapshotsAtTimestamp.map((s) => s.status).join(", ")}). Attempting to resolve by fetching headers...`,
        );
        while (true) {
          try {
            const actualSnapShot = snapshotsAtTimestamp.at(-1)!;
            const result = await fetchHeadersUntilSuccess(
              timestamp,
              actualSnapShot.url,
              snapshotsAtTimestamp.map((s) => s.status).filter(isDefined),
              context,
            );

            const matchingSnapshots = snapshotsAtTimestamp.filter(
              (s) => s.status === result.statusCode,
            );
            if (matchingSnapshots.length > 0) {
              console.log(
                `Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status}`,
              );
              const snapshot = getMergedSnapshot(matchingSnapshots);
              snapshot.metadata = {
                headers: result.responseHeaders,
                rawHeaders: result.rawResponseHeaders,
              };
              uniqueSnapshots.push(snapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            } else if (
              result.statusCode === 302 &&
              snapshotsAtTimestamp.some((s) => s.status === 301)
            ) {
              // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 302 without x-archive-src
              const redirectSnapshot = snapshotsAtTimestamp.findLast((s) => s.status === 301)!;
              console.log(
                `Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status} (NOTE: no matching status code found, but there is a 301 and fetched status is 302)`,
              );
              uniqueSnapshots.push(redirectSnapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            } else if (
              result.statusCode === 404 &&
              snapshotsAtTimestamp.every((s) => [301, 302].includes(s.status ?? 0))
            ) {
              // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 404
              const redirectSnapshot = snapshotsAtTimestamp.findLast((s) =>
                [301, 302].includes(s.status ?? 0),
              )!;
              console.log(
                `Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status} (NOTE: no matching status code found, but all entries are 301/302 and fetched status is 404)`,
              );
              uniqueSnapshots.push(redirectSnapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            } else {
              throw new Error(
                `Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} but couldn't find a matching status code when fetching headers (got ${result.statusCode}, expected ${actualSnapShot.status}).`,
              );
            }
          } catch (error: unknown) {
            console.log((error as Error).message + " Retrying in 30s...");
            await new Promise((res) => setTimeout(res, 30000));
          }
        }
      }
    }
  }
  if (limitedCaptureFiltered > 0) {
    console.log(
      `Filtered out ${limitedCaptureFiltered} snapshots that fell inside limited capture ranges without attempting to resolve duplicates.`,
    );
  }
  if (filteredSnapshots > 0) {
    console.log(`Filtered out ${filteredSnapshots} total duplicate snapshots based on timestamp.`);
  }
  return { uniqueSnapshots, limitedCaptureFiltered, filteredSnapshots };
}

// In some cases, the CDX index may contain multiple snapshots with the same timestamp for the same URL.
// Because the granuarity is only seconds, this can happen if multiple snapshots were taken within the same second
// Because it is only possible to download one snapshot per timestamp per URL, we need to filter out duplicates here
//
// We can't be sure that the snapshot we keep is actually the same one, but the likelihood of contentually different
// snapshots having the same timestamp is very low
export async function filterDuplicateSnapshots(
  requestUrl: string,
  keepInvalid: boolean,
  snapshots: ExtendedCdxEntry[],
  limitedCaptures: LimitedCaptureRange[],
  context: Context,
): Promise<{
  uniqueSnapshots: ExtendedCdxEntry[];
  filteredValidSnapshots: number;
  filteredInvalidSnapshots: number;
  filteredUnwantedSnapshots: number;
  redirectNonSlashFiltered: number;
  limitedCaptureFiltered: number;
  duplicateFiltered: number;
}> {
  const filteredValidSnapshots = 0;
  let filteredUnwantedSnapshots = 0; // these entries are quietly discarded
  const filteredInvalidSnapshots = 0; // these are logged as removed

  // As a very first step, we need to find all duplicate entries and resolve them by fetching the headers to see which one is actually the one that can be fetched
  const result = await resolveDuplicateSnapshots(snapshots, limitedCaptures, context);
  let filteredSnapshots = result.uniqueSnapshots;

  // First we filter snapshots down to the statuscodes we might want to keep (2xx, 301, 302, 404)
  filteredSnapshots = filteredSnapshots.filter((snapshot) => {
    if (snapshot.status && snapshot.status >= 200 && snapshot.status < 300) {
      return true;
    }
    if (INVALID_ALLOWED_STATUS_CODES.includes(snapshot.status ?? 0) && keepInvalid) {
      return true;
    }
    filteredUnwantedSnapshots++;
    return false;
  });

  // Then we filter out the wayback special case for 301/302 snapshots:
  // if the code is a 301/302 and the request URL ended with / but the archive url does not, we will filter it out
  // Such cases are most likely redirects to the URL with the trailing slash, which we don't care about (since the primary
  // purpose is to see when the page was removed)
  let redirectNonSlashFiltered = 0;
  filteredSnapshots = filteredSnapshots.filter((snapshot) => {
    if ([301, 302].includes(snapshot.status ?? 0)) {
      const originalUrl = snapshot.url;
      if (requestUrl.endsWith("/") && !originalUrl.endsWith("/")) {
        filteredUnwantedSnapshots++;
        redirectNonSlashFiltered++;
        return false;
      }
    }
    return true;
  });

  return {
    uniqueSnapshots: filteredSnapshots,
    filteredValidSnapshots,
    filteredInvalidSnapshots,
    filteredUnwantedSnapshots,
    redirectNonSlashFiltered,
    limitedCaptureFiltered: result.limitedCaptureFiltered,
    duplicateFiltered: result.filteredSnapshots - result.limitedCaptureFiltered,
  };
}
