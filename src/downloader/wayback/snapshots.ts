import axios, { all, AxiosResponse } from "axios";
import { DownloadFileInput, LimitedCaptureRange, UrlEntry } from "../../types/download-input-types";
import { CdxEntry, ExtendedCdxEntry } from "../../types/wayback-types";
import { filenameToString } from "../../file-name/file-name";
import { fetchWaybackFileHeaders } from "./file-download";
import { DownloadedFile } from "../../types/download-types";
import { checkForLimitedCapture, filterLimitedCapturesForUrl } from "../../special-rules/limit-captures";
import { Context } from "../../types/context";
import { isDefined } from "../../utils/ts-utils";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF } from "./wayback-common";

const WAYBACK_CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';
const REQUEST_TIMEOUT = 60000; // 60 seconds

const INITIAL_BACKOFF = 30_000; // 30 seconds
const MAX_BACKOFF = 600_000; // 10 minutes

// Redirects and not found are the most likely codes when a page no longer exists
const INVALID_ALLOWED_STATUS_CODES = [301, 302, 303, 304, 307, 308, 403, 404];

export async function getSnapshotsForWebsiteFile(
  input: DownloadFileInput, context: Context,
) {
  const includeInvalid = context.settings.includeInvalid ?? false;
  console.log(`Processing ${filenameToString(input.filename, 'simple')} with output directory: ${input.outputDirectory}`);

  const preliminaryResults: {
    snapshots: ExtendedCdxEntry[],
    url: UrlEntry,
  }[] = []
  const unresolveableRevisits: {
    timestamps: string[],
    url: string,
  }[] = [];
  let allSnapshots: ExtendedCdxEntry[] = [];
  for (const url of input.urls) {
    const snapshots = await getSnapshotsForUrl(url);
    const filteredSnapshots = snapshots.filter(snapshot => snapshot.mimetype !== 'warc/revisit');
    if (filteredSnapshots.length !== snapshots.length) {
      console.log(`Filtered out ${snapshots.length - filteredSnapshots.length} warc/revisit snapshots for ${url.url}`);
      unresolveableRevisits.push({ timestamps: snapshots.filter(s => s.mimetype === 'warc/revisit').map(s => s.timestamp), url: url.url });
    }
    preliminaryResults.push({ snapshots: filteredSnapshots, url });
    allSnapshots = [...allSnapshots, ...filteredSnapshots];
  }
  let validCdxEntries: ExtendedCdxEntry[] = [];
  let invalidCdxEntries: ExtendedCdxEntry[] = [];

  console.log(`Total snapshots found: ${allSnapshots.length}`)
  const limitedCaptureConfigs = checkForLimitedCapture(allSnapshots);
  if (limitedCaptureConfigs.length > 0) {
    console.log(`Found ${limitedCaptureConfigs.length} limited capture ranges that will be applied during postprocessing:`);
    for (const config of limitedCaptureConfigs) {
      console.log(`- from ${config.startTimestamp} to ${config.endTimestamp} (captures per day: ${config.capturesPerDay}${config.mirrorCapturesPerDay ? `, for mirrors: ${config.mirrorCapturesPerDay}` : ''})`);
    }
  }

  let limitedCaptureFiltered = 0;

  for (const { snapshots, url } of preliminaryResults) {
    console.log(`Postprocessing ${url.url}`)
    const { uniqueSnapshots, filteredValidSnapshots, filteredInvalidSnapshots } = await filterDuplicateSnapshots(url.url, includeInvalid && !url.excludeInvalid, snapshots, limitedCaptureConfigs, context);
    let validSnapShots = uniqueSnapshots.filter(snapshot => snapshot.status?.toString().startsWith('2'));
    let invalidSnapshots = uniqueSnapshots.filter(snapshot => !snapshot.status?.toString().startsWith('2'));
    console.log(`Found ${validSnapShots.length} valid snapshots for ${url.url}`);
    if (invalidSnapshots.length > 0) {
      console.log(`Found ${invalidSnapshots.length} invalid snapshots for ${url.url}`);
    }
    if (filteredValidSnapshots > 0) {
      console.log(`Removed ${filteredValidSnapshots} duplicate valid snapshots for ${url.url}`);
    }
    if (filteredInvalidSnapshots > 0) {
      console.log(`Removed ${filteredInvalidSnapshots} duplicate invalid snapshots for ${url.url}`);
    }

    const originalValidCount = validSnapShots.length;
    validSnapShots = filterLimitedCapturesForUrl(validSnapShots, limitedCaptureConfigs, url.mirrorUrl);
    if (validSnapShots.length !== originalValidCount) {
      console.log(`Filtered ${originalValidCount - validSnapShots.length} snapshots for ${url.url} based on limited captures.`);
      limitedCaptureFiltered += originalValidCount - validSnapShots.length;
    }
    const originalInvalidCount = invalidSnapshots.length;
    invalidSnapshots = filterLimitedCapturesForUrl(invalidSnapshots, limitedCaptureConfigs, url.mirrorUrl);
    if (invalidSnapshots.length !== originalInvalidCount) {
      console.log(`Filtered ${originalInvalidCount - invalidSnapshots.length} invalid snapshots for ${url.url} based on limited captures.`);
      limitedCaptureFiltered += originalInvalidCount - invalidSnapshots.length;
    }
    validCdxEntries = [...validCdxEntries, ...validSnapShots];
    invalidCdxEntries = [...invalidCdxEntries, ...invalidSnapshots];
  }
  console.log(`Total valid snapshots for ${filenameToString(input.filename, 'simple')}: ${validCdxEntries.length}`);
  if (includeInvalid) {
    console.log(`Total invalid snapshots for ${filenameToString(input.filename, 'simple')}: ${invalidCdxEntries.length}`);
  }
  return {
    validCdxEntries: validCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    invalidCdxEntries: invalidCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    metadata: {
      limitedCapture: limitedCaptureFiltered ? {
        limitedCaptureConfigs,
        filteredEntries: limitedCaptureFiltered,
      } : undefined,
      unresolveableRevisits: unresolveableRevisits.length > 0 ? {
        entries: unresolveableRevisits
      } : undefined
    }
  };
}

async function fetchHeadersUntilSuccess(timestamp: string, url: string, statusCodes: number[], context: Context): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  let attempt = 1;
  // Redirects might not resolve to the actual capture, so we might not actually get x-archive-src.
  // Hopefully such timestamps that also have 200 captures would always resolve to the 200 capture or other code
  const potentialRedirect = statusCodes.some(code => [301, 302].includes(code));
  const allRedirect = statusCodes.every(code => [301, 302].includes(code));
  const maxRedirectAttempts = allRedirect ? 5 : potentialRedirect ? 15 : 0; // Only attempt retries for missing x-archive-src if there is a potential redirect, otherwise it is likely an actual issue
  let redirectAttempts = 1;
  let redirectBackoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const result = await fetchWaybackFileHeaders(timestamp, url);
      if (context.settings.skipOn302) {
        return result;
      }
      if (result.headers['x-archive-src'] === undefined) {
        if (!allRedirect && !potentialRedirect) {
          throw new Error(`Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}`);
        }
        else if (redirectAttempts < maxRedirectAttempts && result.statusCode === 302) {
          console.log(`Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}, this ${allRedirect ? 'redirect only' : 'potential redirect'} capture might be unavailable. Retrying in ${redirectBackoff / 1000}s... (attempt ${redirectAttempts})`);
          await new Promise(res => setTimeout(res, redirectBackoff));
          redirectBackoff = Math.min(redirectBackoff * 2, MAX_BACKOFF);
          redirectAttempts++;
        }
        else {
          return result;
        }
      }
      else {
        return result;
      }
    } catch (error) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${error}, (attempt ${attempt}) retrying in 30s...`);
      await new Promise(res => setTimeout(res, 30000));
      attempt++;
    }
  }
}

function getMergedSnapshot(snapshotsAtTimestamp: ExtendedCdxEntry[]): ExtendedCdxEntry {
  const mergedSnapshot = { ...snapshotsAtTimestamp.at(-1)! };
  const uniqueDigests = new Set(snapshotsAtTimestamp.map(s => s.digest));
  const uniqueSize = new Set(snapshotsAtTimestamp.map(s => s.length));
  // If the digest or size is different between the snapshots, we can't be sure which one is the correct one, so we will clear the digest and size to indicate that the values are unknown.
  if (uniqueDigests.size > 1) {
    mergedSnapshot.digest = undefined;
  }
  if (uniqueSize.size > 1) {
    mergedSnapshot.length = undefined;
  }
  return mergedSnapshot;
}

async function resolveDuplicateSnapshots(snapshots: ExtendedCdxEntry[], limitedCaptures: LimitedCaptureRange[], context: Context): Promise<ExtendedCdxEntry[]> {
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
    }
    else {
      // A performance optimization: If the duplicate falls inside a limited capture range, we won't even try resolving it and just filter out all duplicates here
      if (limitedCaptures.length > 0) {
        const inLimitedCapture = limitedCaptures.some(range => timestamp >= range.startTimestamp && timestamp <= range.endTimestamp);
        if (inLimitedCapture) {
          limitedCaptureFiltered += snapshotsAtTimestamp.length;
          filteredSnapshots += snapshotsAtTimestamp.length;
          continue;
        }
      }

      const potentialSnapshot = snapshotsAtTimestamp.at(-1)!;
      const allSameStatus = snapshotsAtTimestamp.every(s => s.status === potentialSnapshot.status);
      if (allSameStatus) {
        console.log(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url}. All snapshots have the same status code ${potentialSnapshot.status} for ${potentialSnapshot.url} at ${timestamp}, no need to fetch headers to resolve.`);
        const snapshot = getMergedSnapshot(snapshotsAtTimestamp);
        uniqueSnapshots.push(snapshot);
        filteredSnapshots += snapshotsAtTimestamp.length - 1;
      }
      else {
        console.log(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} (status codes ${snapshotsAtTimestamp.map(s => s.status).join(', ')}). Attempting to resolve by fetching headers...`);
        while (true) {
          try {

            const actualSnapShot = snapshotsAtTimestamp.at(-1)!;
            const result = await fetchHeadersUntilSuccess(timestamp, actualSnapShot.url, snapshotsAtTimestamp.map(s => s.status).filter(isDefined), context);

            const matchingSnapshots = snapshotsAtTimestamp.filter(s => s.status === result.statusCode);
            if (matchingSnapshots.length > 0) {
              console.log(`Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status}`);
              const snapshot = getMergedSnapshot(matchingSnapshots);
              snapshot.metadata = { headers: result.headers, rawHeaders: result.rawHeaders };
              uniqueSnapshots.push(snapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            }
            else if (result.statusCode === 302 && snapshotsAtTimestamp.some(s => s.status === 301)) {
              // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 302 without x-archive-src
              const redirectSnapshot = snapshotsAtTimestamp.findLast(s => s.status === 301)!;
              console.log(`Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status} (NOTE: no matching status code found, but there is a 301 and fetched status is 302)`);
              uniqueSnapshots.push(redirectSnapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            }
            else if (result.statusCode === 404 && snapshotsAtTimestamp.every(s => [301, 302].includes(s.status ?? 0))) {
              // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 404
              const redirectSnapshot = snapshotsAtTimestamp.findLast(s => [301, 302].includes(s.status ?? 0))!;
              console.log(`Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status} (NOTE: no matching status code found, but all entries are 301/302 and fetched status is 404)`);
              uniqueSnapshots.push(redirectSnapshot);
              filteredSnapshots += snapshotsAtTimestamp.length - 1;
              break;
            }
            else {
              throw new Error(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} but couldn't find a matching status code when fetching headers (got ${result.statusCode}, expected ${actualSnapShot.status}).`);
            }
          } catch (error: unknown) {
            console.log((error as Error).message + ` Retrying in 30s...`);
            await new Promise(res => setTimeout(res, 30000));
          }
        }
      }
    }
  }
  if (limitedCaptureFiltered > 0) {
    console.log(`Filtered out ${limitedCaptureFiltered} snapshots that fell inside limited capture ranges without attempting to resolve duplicates.`);
  }
  if (filteredSnapshots > 0) {
    console.log(`Filtered out ${filteredSnapshots} total duplicate snapshots based on timestamp.`);
  }
  return uniqueSnapshots;
}

// In some cases, the CDX index may contain multiple snapshots with the same timestamp for the same URL.
// Because the granuarity is only seconds, this can happen if multiple snapshots were taken within the same second
// Because it is only possible to download one snapshot per timestamp per URL, we need to filter out duplicates here
//
// We can't be sure that the snapshot we keep is actually the same one, but the likelihood of contentually different
// snapshots having the same timestamp is very low
async function filterDuplicateSnapshots(
  requestUrl: string,
  keepInvalid: boolean,
  snapshots: ExtendedCdxEntry[],
  limitedCaptures: LimitedCaptureRange[],
  context: Context
): Promise<{
  uniqueSnapshots: ExtendedCdxEntry[],
  filteredValidSnapshots: number,
  filteredInvalidSnapshots: number,
  filteredUnwantedSnapshots: number
}> {
  let filteredValidSnapshots = 0;
  let filteredUnwantedSnapshots = 0; // these entries are quietly discarded
  let filteredInvalidSnapshots = 0; // these are logged as removed


  // As a very first step, we need to find all duplicate entries and resolve them by fetching the headers to see which one is actually the one that can be fetched
  let filteredSnapshots = await resolveDuplicateSnapshots(snapshots, limitedCaptures, context);

  // First we filter snapshots down to the statuscodes we might want to keep (2xx, 301, 302, 404)
  filteredSnapshots = filteredSnapshots.filter(snapshot => {
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
  filteredSnapshots = filteredSnapshots.filter(snapshot => {
    if ([301, 302].includes(snapshot.status ?? 0)) {
      const originalUrl = snapshot.url;
      if (requestUrl.endsWith('/') && !originalUrl.endsWith('/')) {
        filteredUnwantedSnapshots++;
        return false;
      }
    }
    return true;
  });

  return { uniqueSnapshots: filteredSnapshots, filteredValidSnapshots, filteredInvalidSnapshots, filteredUnwantedSnapshots };
}

function validateCdxEntryFieldMatch(first: CdxEntry, second: CdxEntry, field: keyof CdxEntry) {
  if (first[field] !== second[field]) {
    throw new Error(`CDX entries with same timestamp have different ${field} values, which should not happen. Timestamp: ${first.timestamp}, URL: ${first.url}, value1: ${first[field]}, value2: ${second[field]}`);
  }
}

async function getSnapshotsForUrl(url: UrlEntry) {
  const allSnapshots = await fetchWaybackCdxIndex(url.url, false);
  console.log(`Found ${allSnapshots.length} total snapshots for ${url.url}.`);
  const filteredSnapshots = filterSnapshotsByTimestamp(allSnapshots, url.maxTimestamp, url.minTimestamp);
  if (filteredSnapshots.length !== allSnapshots.length) {
    console.log(`Filtered ${allSnapshots.length - filteredSnapshots.length} snapshots for ${url.url} based on timestamp constraints`);
  }
  const revisitCount = filteredSnapshots.filter(s => s.mimetype === 'warc/revisit').length;
  if (revisitCount > 0) {
    console.log(`Found ${revisitCount} warc/revisit snapshots for ${url.url}. Will resolve revisits.`);
    const resolvedSnapshots = await fetchWaybackCdxIndex(url.url, true);
    const filteredResolvedSnapshots = filterSnapshotsByTimestamp(resolvedSnapshots, url.maxTimestamp, url.minTimestamp);
    if (filteredResolvedSnapshots.length !== filteredSnapshots.length) {
      throw new Error(`Unexpectedly found a different number of snapshots when fetching with resolve revisits (got ${filteredResolvedSnapshots.length}, expected ${filteredSnapshots.length}) for ${url.url}.`);
    }
    filteredSnapshots.forEach((snapshot, index) => {
      if (snapshot.mimetype === 'warc/revisit') {
        const resolvedSnapshot = filteredResolvedSnapshots[index];
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, 'timestamp');
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, 'url');
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, 'digest');
        validateCdxEntryFieldMatch(snapshot, resolvedSnapshot, 'length');
        filteredSnapshots[index] = {
          ...resolvedSnapshot,
          revisitEntry: snapshot,
        };
      }
    });
  }

  return filteredSnapshots;
}

function filterSnapshotsByTimestamp(snapshots: ExtendedCdxEntry[], maxTimestamp?: string, minTimestamp?: string) {
  return snapshots.filter(snapshot => {
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
async function fetchWaybackCdxIndex(url: string, resolveRevisits: boolean): Promise<ExtendedCdxEntry[]> {
  let attempt = 1;
  let backoff = WAYBACK_INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching CDX index${resolveRevisits ? ' with resolve revisits' : ''} for ${url} (attempt ${attempt})...`);
      const params = {
        url,
        output: 'json',
        fl: 'timestamp,original,statuscode,digest,mimetype,length,urlkey,filename,offset',
        resolveRevisits: resolveRevisits ? 'true' : 'false',
      };
      const response: AxiosResponse<string[][]> = await axios.get(WAYBACK_CDX_API_URL, { params, timeout: REQUEST_TIMEOUT });
      const data = response.data;
      const snapshots: ExtendedCdxEntry[] = data.slice(1)
        .map(row => ({
          urlkey: row[6],
          timestamp: row[0],
          url: row[1],
          status: row[2] && row[2] !== '-' ? parseInt(row[2], 10) : undefined,
          digest: row[3],
          mimetype: row[4],
          length: row[5] ? parseInt(row[5], 10) : undefined,
          filename: row[7] ?? undefined,
          offset: row[8] ? parseInt(row[8], 10) : undefined,
          source: "wayback"
        }))
      return snapshots;
    } catch (e) {
      console.log(`Error fetching CDX index for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
      attempt++;
    }
  }
}
