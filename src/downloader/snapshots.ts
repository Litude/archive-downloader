import axios, { AxiosResponse } from "axios";
import { filterLimitedCapturesForUrl } from "../special-rules/limit-captures";
import { DownloadFileInput, LimitedCaptureRange, UrlEntry } from "../types/download-input-types";
import { CdxEntry } from "../types/wayback-types";
import { filenameToString } from "../file-name/file-name";
import { fetchWaybackFileHeaders } from "./file-download";
import { DownloadedFile } from "../types/download-types";

const WAYBACK_CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';
const REQUEST_TIMEOUT = 60000; // 60 seconds

const INITIAL_BACKOFF = 30_000; // 30 seconds
const MAX_BACKOFF = 600_000; // 10 minutes

// Redirects and not found are the most likely codes when a page no longer exists
const INVALID_ALLOWED_STATUS_CODES = ['301', '302', '403', '404'];

export async function getSnapshotsForWebsiteFile(
  input: DownloadFileInput, includeInvalid = false
) {
  console.log(`Processing ${filenameToString(input.filename, 'simple')} with output directory: ${input.outputDirectory}`);
  const validCdxEntries: CdxEntry[] = [];
  const invalidCdxEntries: CdxEntry[] = [];
  for (const url of input.urls) {
      const { validSnapShots, invalidSnapshots } = await getSnapshotsForUrl(url, includeInvalid, input.limitedCaptures);
      const filteredSnapshots = filterLimitedCapturesForUrl(validSnapShots, input.limitedCaptures);
      if (filteredSnapshots.length !== validSnapShots.length) {
        console.log(`Filtered ${validSnapShots.length - filteredSnapshots.length} snapshots for ${url.url} based on limited captures.`);
      }
      const filteredInvalidSnapshots = filterLimitedCapturesForUrl(invalidSnapshots, input.limitedCaptures);
      if (filteredInvalidSnapshots.length !== invalidSnapshots.length) {
        console.log(`Filtered ${invalidSnapshots.length - filteredInvalidSnapshots.length} invalid snapshots for ${url.url} based on limited captures.`);
      }
      validCdxEntries.push(...filteredSnapshots);
      invalidCdxEntries.push(...filteredInvalidSnapshots);
  }
  console.log(`Total valid snapshots for ${filenameToString(input.filename, 'simple')}: ${validCdxEntries.length}`);
  if (includeInvalid) {
      console.log(`Total invalid snapshots for ${filenameToString(input.filename, 'simple')}: ${invalidCdxEntries.length}`);
  }
  return {
    validCdxEntries: validCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    invalidCdxEntries: invalidCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  };
}

function validateNoRevisitSnapshots(snapshots: CdxEntry[]): void {
  const revisitSnapshot = snapshots.find(snapshot => snapshot.mimetype === "warc/revisit");
  if (revisitSnapshot) {
    throw new Error(`Snapshot for ${revisitSnapshot.url} at ${revisitSnapshot.timestamp} is a warc/revisit snapshot. These should be resolved by the API parameter, something is wrong!.`);
  }
}

async function fetchHeadersUntilSuccess(timestamp: string, url: string, statusCodes: string[]): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  let attempt = 1;
  // Redirects might not resolve to the actual capture, so we might not actually get x-archive-src.
  // Hopefully such timestamps that also have 200 captures would always resolve to the 200 capture or other code
  const potentialRedirect = statusCodes.every(code => ['301', '302'].includes(code));
  let redirectAttempts = 1;
  let redirectBackoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const result = await fetchWaybackFileHeaders(timestamp, url);
      if (result.headers['x-archive-src'] === undefined) {
        if (!potentialRedirect) {
          throw new Error(`Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}`);
        }
        else if (redirectAttempts < 5 && result.statusCode === '302') {
          console.log(`Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}, this redirect only capture might be unavailable. Retrying in ${redirectBackoff / 1000}s... (attempt ${redirectAttempts})`);
          await new Promise(res => setTimeout(res, redirectBackoff));
          redirectBackoff = Math.min(redirectBackoff * 2, MAX_BACKOFF);
          redirectAttempts++;
        }
      }
      return result;
    } catch (error) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${error}, (attempt ${attempt}) retrying in 30s...`);
      await new Promise(res => setTimeout(res, 30000)); 
      attempt++;
    }
  }
}

// Logic is based on
// https://github.com/internetarchive/wayback/blob/master/wayback-core/src/main/java/org/archive/wayback/resourceindex/filters/DuplicateTimestampFilter.java
function filterDuplicateTimestampSnapshots(snapshotsAtTimestamp: CdxEntry[]): CdxEntry {
  return snapshotsAtTimestamp.reduce((best, current) => {
    const bestStatus = best.status ? parseInt(best.status, 10) : 9999;
    const currentStatus = current.status ? parseInt(current.status, 10) : 9999;
    return currentStatus < bestStatus ? current : best;
  });
}

async function resolveDuplicateSnapshots(snapshots: CdxEntry[], limitedCaptures: LimitedCaptureRange[]): Promise<CdxEntry[]> {
  // Group snapshots by timestamp to handle duplicates
  const snapshotsByTimestamp = new Map<string, CdxEntry[]>();
  let filteredSnapshots = 0;
  for (const snapshot of snapshots) {
    const timestamp = snapshot.timestamp;
    if (!snapshotsByTimestamp.has(timestamp)) {
      snapshotsByTimestamp.set(timestamp, []);
    }
    snapshotsByTimestamp.get(timestamp)!.push(snapshot);
  }
  let limitedCaptureFiltered = 0;

  const uniqueSnapshots: CdxEntry[] = [];

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

      // From testing, it seems the web archive always returns the last snapshot for a given timestamp when there are duplicates
      // 
      console.log(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} (status codes ${snapshotsAtTimestamp.map(s => s.status).join(', ')}). Attempting to resolve by fetching headers...`);
      while (true) {
        try {
          const actualSnapShot = snapshotsAtTimestamp.at(-1)!;
          //const actualSnapShot = filterDuplicateTimestampSnapshots(snapshotsAtTimestamp);
          const result = await fetchHeadersUntilSuccess(timestamp, actualSnapShot.url, snapshotsAtTimestamp.map(s => s.status));

          const snapshot = snapshotsAtTimestamp.findLast(s => s.status === result.statusCode);
          if (snapshot) {
            console.log(`Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status}`);
            uniqueSnapshots.push(actualSnapShot);
            filteredSnapshots += snapshotsAtTimestamp.length - 1;
            break;
          }
          else if (result.statusCode === '302' && snapshotsAtTimestamp.some(s => s.status === '301')) {
            // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 302 without x-archive-src
            const redirectSnapshot = snapshotsAtTimestamp.findLast(s => s.status === '301')!;
            console.log(`Resolved duplicate snapshots for ${actualSnapShot.url} at ${timestamp}: status ${actualSnapShot.status} (NOTE: no matching status code found, but there is a 301 and fetched status is 302)`);
            uniqueSnapshots.push(redirectSnapshot);
            filteredSnapshots += snapshotsAtTimestamp.length - 1;
            break;
          }
          else if (result.statusCode === '404' && snapshotsAtTimestamp.every(s => ['301', '302'].includes(s.status))) {
            // Special case for 301/302 captures where they are self redirects and there are no actual captures, the web archive will return 404
            const redirectSnapshot = snapshotsAtTimestamp.findLast(s => ['301', '302'].includes(s.status))!;
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
  if (limitedCaptureFiltered > 0) {
    console.log(`Filtered out ${limitedCaptureFiltered} snapshots that fell inside limited capture ranges without attempting to resolve duplicates.`);
  }
  if (filteredSnapshots > 0) {
    console.log(`Filtered out ${filteredSnapshots} total duplicate snapshots based on timestamp.`);
  }
  return uniqueSnapshots;
}

// In very rare cases, the CDX index may contain multiple snapshots with the same timestamp for the same URL.
// Because the granuarity is only seconds, this can happen if multiple snapshots were taken within the same second
// Because it is only possible to download one snapshot per timestamp per URL, we need to filter out duplicates here
//
// We can't be sure that the snapshot we keep is actually the same one, but the likelihood of contentually different
// snapshots having the same timestamp is very low
//
// TODO: This needs further investigation: Should they actually be deduplicated based on the cdx index url key? Would
// need to find some captures where this happens to investigate...
//
// microsoft.com/italy/games/empires has a duplicate captures at 20071024014608 and 20090329081915 (301 and 200 status codes, 200 is the returned one)
// microsoft.com/games/aoeexpansion/features_buildings_rendered.htm has duplicate snapshot at 20091212001836 (2x 200 status codes)
// microsoft.com/msdownload/games/empires/download.htm has duplicate snapshot at 20080405205900 (301 and 404 status codes, 404 is the returned one)
async function filterDuplicateSnapshots(requestUrl: string, keepInvalid: boolean, snapshots: CdxEntry[], limitedCaptures: LimitedCaptureRange[]) {
  let filteredValidSnapshots = 0;
  let filteredUnwantedSnapshots = 0; // these entries are quietly discarded
  let filteredInvalidSnapshots = 0; // these are logged as removed


  // As a very first step, we need to find all duplicate entries and resolve them by fetching the headers to see which one is actually the one that can be fetched
  let filteredSnapshots = await resolveDuplicateSnapshots(snapshots, limitedCaptures);

  // First we filter snapshots down to the statuscodes we might want to keep (2xx, 301, 302, 404)
  filteredSnapshots = filteredSnapshots.filter(snapshot => {
    if (snapshot.status.startsWith('2')) {
      return true;
    }
    if (INVALID_ALLOWED_STATUS_CODES.includes(snapshot.status) && keepInvalid) {
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
    if (['301', '302'].includes(snapshot.status)) {
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

async function getSnapshotsForUrl(url: UrlEntry, includeInvalid: boolean, limitedCaptures: LimitedCaptureRange[]) {
  const allSnapshots = await fetchWaybackCdxIndex(url.url);
  const filteredSnapshots = filterSnapshotsByTimestamp(allSnapshots, url.maxTimestamp, url.minTimestamp);
  if (filteredSnapshots.length !== allSnapshots.length) {
    console.log(`Filtered ${allSnapshots.length - filteredSnapshots.length} snapshots for ${url.url} based on timestamp constraints`);
  }
  validateNoRevisitSnapshots(filteredSnapshots);

  const { uniqueSnapshots, filteredValidSnapshots, filteredInvalidSnapshots } = await filterDuplicateSnapshots(url.url, includeInvalid && !url.excludeInvalid, filteredSnapshots, limitedCaptures);
  const validSnapShots = uniqueSnapshots.filter(snapshot => snapshot.status.startsWith('2'));
  const invalidSnapshots = uniqueSnapshots.filter(snapshot => !snapshot.status.startsWith('2'));
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
  return { validSnapShots, invalidSnapshots };
}

function filterSnapshotsByTimestamp(snapshots: CdxEntry[], maxTimestamp?: string, minTimestamp?: string) {
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
async function fetchWaybackCdxIndex(url: string): Promise<CdxEntry[]> {
  let attempt = 1;
  let backoff = 30_000;
  while (true) {
    try {
      console.log(`Fetching CDX index for ${url} (attempt ${attempt})...`);
      const params: any = {
        url,
        output: 'json',
        fl: 'timestamp,original,statuscode,digest,mimetype,length,urlkey',
        resolveRevisits: 'true',
      };
      const response: AxiosResponse<string[][]> = await axios.get(WAYBACK_CDX_API_URL, { params, timeout: REQUEST_TIMEOUT });
      const data = response.data;
      const snapshots: CdxEntry[] = data.slice(1)
        .map(row => ({
          urlkey: `${row[0]}:${row[6]}`,
          timestamp: row[0],
          url: row[1],
          status: row[2],
          digest: row[3],
          mimetype: row[4],
          length: parseInt(row[5], 10),
        }))
      return snapshots;
    } catch (e) {
      console.log(`Error fetching CDX index for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, 300_000);
      attempt++;
    }
  }
}
