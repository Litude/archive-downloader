import axios, { AxiosResponse } from "axios";
import { filterLimitedCapturesForUrl } from "../special-rules/limit-captures";
import { DownloadFileInput, UrlEntry } from "../types/download-input-types";
import { CdxEntry } from "../types/wayback-types";
import { filenameToString } from "../file-name/file-name";

const WAYBACK_CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';
const REQUEST_TIMEOUT = 60000; // 60 seconds

// Redirects and not found are the most likely codes when a page no longer exists
const INVALID_ALLOWED_STATUS_CODES = ['301', '302', '404'];

export async function getSnapshotsForWebsiteFile(
  input: DownloadFileInput, includeInvalid = false
) {
  console.log(`Processing ${filenameToString(input.filename, 'simple')} with output directory: ${input.outputDirectory}`);
  const validCdxEntries: CdxEntry[] = [];
  const invalidCdxEntries: CdxEntry[] = [];
  for (const url of input.urls) {
      const { validSnapShots, invalidSnapshots } = await getSnapshotsForUrl(url, includeInvalid);
      const filteredSnapshots = filterLimitedCapturesForUrl(validSnapShots, input.limitedCaptures);
      if (filteredSnapshots.length !== validSnapShots.length) {
        console.log(`Filtered ${validSnapShots.length - filteredSnapshots.length} snapshots for ${url.url} based on limited captures.`);
      }
      validCdxEntries.push(...filteredSnapshots);
      invalidCdxEntries.push(...invalidSnapshots);
  }
  console.log(`Total valid snapshots for ${filenameToString(input.filename, 'simple')}: ${validCdxEntries.length}`);
  if (includeInvalid) {
      console.log(`Total invalid snapshots for ${filenameToString(input.filename, 'simple')}: ${invalidCdxEntries.length}`);
  }
  return { validCdxEntries, invalidCdxEntries };
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
function filterDuplicateSnapshots(requestUrl: string, keepInvalid: boolean, snapshots: CdxEntry[]) {
  const uniqueSnapshots: CdxEntry[] = [];
  let filteredValidSnapshots = 0;
  let filteredUnwantedSnapshots = 0; // these entries are quietly discarded
  let filteredInvalidSnapshots = 0; // these are logged as removed

  if (snapshots.some((s) => s.mimetype === "warc/revisit")) {
    throw new Error(`WARC revisit entries found in CDX index for ${requestUrl}! Investigate how to handle!`);
  }

  // First we filter snapshots down to the statuscodes we might want to keep (2xx, 301, 302, 404)
  let filteredSnapshots = snapshots.filter(snapshot => {
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

  // Now we should have only valid snapshots left
  
  // Group snapshots by timestamp to handle duplicates
  const snapshotsByTimestamp = new Map<string, CdxEntry[]>();
  for (const snapshot of filteredSnapshots) {
    const timestamp = snapshot.timestamp;
    if (!snapshotsByTimestamp.has(timestamp)) {
      snapshotsByTimestamp.set(timestamp, []);
    }
    snapshotsByTimestamp.get(timestamp)!.push(snapshot);
  }
  
  // For each timestamp, prefer 2xx status codes, otherwise take the first
  for (const [timestamp, snapshotsAtTimestamp] of snapshotsByTimestamp) {
    if (snapshotsAtTimestamp.length === 1) {
      uniqueSnapshots.push(snapshotsAtTimestamp[0]);
    }
    else {
      const validSnapshots = snapshotsAtTimestamp.filter(s => s.status.startsWith('2'));
      const invalidSnapshots = snapshotsAtTimestamp.filter(s => !s.status.startsWith('2'));
      if (validSnapshots.length > 0) {
        uniqueSnapshots.push(validSnapshots[0]);
        filteredValidSnapshots += validSnapshots.length - 1;
        filteredInvalidSnapshots += invalidSnapshots.length;
      }
      // Only invalid snapshots for this timestamp
      else {
        uniqueSnapshots.push(invalidSnapshots[0]);
        filteredInvalidSnapshots += invalidSnapshots.length - 1;
      }
    }
  }
  
  return { uniqueSnapshots, filteredValidSnapshots, filteredInvalidSnapshots, filteredUnwantedSnapshots };
}

async function getSnapshotsForUrl(url: UrlEntry, includeInvalid: boolean) {
  const allSnapshots = await fetchWaybackCdxIndex(url.url);
  const { uniqueSnapshots, filteredValidSnapshots, filteredInvalidSnapshots } = filterDuplicateSnapshots(url.url, includeInvalid && !url.mirrorUrl, allSnapshots);
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

  const finalValidSnapshots = filterSnapshotsByTimestamp(validSnapShots, url.maxTimestamp, url.minTimestamp);
  if (finalValidSnapshots.length !== validSnapShots.length) {
    console.log(`Filtered ${validSnapShots.length - finalValidSnapshots.length} snapshots for ${url.url} based on timestamp constraints`);
  }
  const finalInvalidSnapshots = filterSnapshotsByTimestamp(invalidSnapshots, url.maxTimestamp, url.minTimestamp);
  if (finalInvalidSnapshots.length !== invalidSnapshots.length) {
    console.log(`Filtered ${invalidSnapshots.length - finalInvalidSnapshots.length} invalid snapshots for ${url.url} based on timestamp constraints`);
  }
  return { validSnapShots: finalValidSnapshots, invalidSnapshots: finalInvalidSnapshots };
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
