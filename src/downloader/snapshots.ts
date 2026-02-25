import axios, { AxiosResponse } from "axios";
import { filterLimitedCapturesForUrl } from "../special-rules/limit-captures";
import { DownloadFileInput, UrlEntry } from "../types/download-input-types";
import { CdxEntry } from "../types/wayback-types";
import { filenameToString } from "../file-name/file-name";
import { fetchWaybackFileHeaders } from "./file-download";
import { DownloadedFile } from "../types/download-types";

const WAYBACK_CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';
const REQUEST_TIMEOUT = 60000; // 60 seconds

// Redirects and not found are the most likely codes when a page no longer exists
const INVALID_ALLOWED_STATUS_CODES = ['301', '302', '403', '404'];

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
  return {
    validCdxEntries: validCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    invalidCdxEntries: invalidCdxEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  };
}

// warc/revisit examples at:
// http://radgametools.com/down/bink/radtools.exe
// http://www.microsoft.com/taiwan/products/Game/AOE/empirestips/images/y08_small.jpg
// (does handling them require getting the file info itself...?)
// Retrieve headers and only keep if status code is 200 and update mime/type?
//
// This is deprecated, can be resolved automatically by the CDX API with the resolveRevisits parameter, but we keep it here just in case we need to do some manual resolving for some reason
async function resolveRevisitSnapshots(snapshots: CdxEntry[]): Promise<CdxEntry[]> {
  const result = await Promise.all(snapshots.map(async (snapshot) => {
    if (snapshot.mimetype === "warc/revisit") {
      throw new Error(`Snapshot for ${snapshot.url} at ${snapshot.timestamp} is a warc/revisit snapshot. These should be resolved by the API parameter, something is wrong!.`);
      console.log(`Resolving warc/revisit snapshot for ${snapshot.url} at ${snapshot.timestamp}...`);
      while (true) {
        try {
          const headerResult = await fetchWaybackFileHeaders(snapshot.timestamp, snapshot.url);
          if (!headerResult.headers['x-archive-src']) {
            throw new Error(`Missing x-archive-src header in response when resolving warc/revisit snapshot for ${snapshot.url} at ${snapshot.timestamp}`);
          }
          console.log(`Resolved warc/revisit snapshot for ${snapshot.url} at ${snapshot.timestamp}: status ${headerResult.statusCode}, mimetype ${headerResult.headers['content-type']}`);
          return {
            ...snapshot,
            mimetype: headerResult.headers['content-type'] || 'application/octet-stream',
            status: headerResult.statusCode,
            metadata: {
              revisit: 'true',
              originalMimeType: snapshot.mimetype,
              originalStatusCode: snapshot.status
            }
          }
        } catch (error) {
          console.log(`Error resolving warc/revisit snapshot for ${snapshot.url} at ${snapshot.timestamp}: ${error}, retrying in 30s...`);
          await new Promise(res => setTimeout(res, 30000));
        }
      }
    }
    else {
      return snapshot;
    }
  }));
  return result;
}

async function fetchHeadersUntilSuccess(timestamp: string, url: string): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  let attempt = 1;
  while (true) {
    try {
      const result = await fetchWaybackFileHeaders(timestamp, url);
      if (result.headers['x-archive-src'] === undefined) {
        throw new Error(`Missing x-archive-src header in response when fetching headers for ${timestamp}-${url}`);
      }
      return result;
    } catch (error) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${error}, (attempt ${attempt}) retrying in 30s...`);
      await new Promise(res => setTimeout(res, 30000)); 
      attempt++;
    }
  }
}

async function resolveDuplicateSnapshots(snapshots: CdxEntry[]): Promise<CdxEntry[]> {
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

  const uniqueSnapshots: CdxEntry[] = [];

  // For each timestamp, check if there are multiple snapshots. If so, we need to resolve which one is the correct one by fetching the headers and comparing the status codes
  for (const [timestamp, snapshotsAtTimestamp] of snapshotsByTimestamp) {
    if (snapshotsAtTimestamp.length === 1) {
      uniqueSnapshots.push(snapshotsAtTimestamp[0]);
    }
    else {
      console.log(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} (status codes ${snapshotsAtTimestamp.map(s => s.status).join(', ')}). Attempting to resolve by fetching headers...`);
      const result = await fetchHeadersUntilSuccess(timestamp, snapshotsAtTimestamp[0].url);
      const matchingSnapshot = snapshotsAtTimestamp.find(s => s.status === result.statusCode);
      if (matchingSnapshot) {
        console.log(`Resolved duplicate snapshots for ${matchingSnapshot.url} at ${timestamp}: status ${matchingSnapshot.status}`);
        uniqueSnapshots.push(matchingSnapshot);
        filteredSnapshots += snapshotsAtTimestamp.length - 1;
      }
      else {
        throw new Error(`Found ${snapshotsAtTimestamp.length} snapshots with same timestamp ${timestamp} for ${snapshotsAtTimestamp[0].url} but couldn't find a matching status code when fetching headers.`);
      }
      // const validSnapshots = snapshotsAtTimestamp.filter(s => s.status.startsWith('2'));
      // const invalidSnapshots = snapshotsAtTimestamp.filter(s => !s.status.startsWith('2'));
      // if (validSnapshots.length > 0) {
      //   uniqueSnapshots.push(validSnapshots[0]);
      //   filteredValidSnapshots += validSnapshots.length - 1;
      //   filteredInvalidSnapshots += invalidSnapshots.length;
      // }
      // // Only invalid snapshots for this timestamp
      // else {
      //   if (invalidSnapshots.length > 1) {
      //     console.log(`Found ${invalidSnapshots.length} snapshots with same timestamp ${timestamp} for ${requestUrl}. Attempting to resolve by fetching headers...`);
      //     const result = await fetchWaybackFileHeaders(invalidSnapshots[0].timestamp, invalidSnapshots[0].url, invalidSnapshots.map(s => s.status));
      //     const matchingSnapshot = invalidSnapshots.find(s => s.status === result.statusCode);
      //     if (matchingSnapshot) {
      //       uniqueSnapshots.push(matchingSnapshot);
      //       filteredInvalidSnapshots += invalidSnapshots.length - 1;
      //     }
      //     else {
      //       throw new Error(`Found ${invalidSnapshots.length} snapshots with same timestamp ${timestamp} for ${requestUrl} but couldn't find a matching status code when fetching headers.`);
      //     }
      //   }
      //   else {
      //     // Exactly 1 invalid snapshot
      //     uniqueSnapshots.push(invalidSnapshots[0]);
      //   }
      //   filteredInvalidSnapshots += invalidSnapshots.length - 1;
      // }
    }
  }
  if (filteredSnapshots > 0) {
    console.log(`Filtered out ${filteredSnapshots} duplicate snapshots based on timestamp.`);
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
async function filterDuplicateSnapshots(requestUrl: string, keepInvalid: boolean, snapshots: CdxEntry[]) {
  let filteredValidSnapshots = 0;
  let filteredUnwantedSnapshots = 0; // these entries are quietly discarded
  let filteredInvalidSnapshots = 0; // these are logged as removed


  // As a very first step, we need to find all duplicate entries and resolve them by fetching the headers to see which one is actually the one that can be fetched
  let filteredSnapshots = await resolveDuplicateSnapshots(snapshots);

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

async function getSnapshotsForUrl(url: UrlEntry, includeInvalid: boolean) {
  const allSnapshots = await fetchWaybackCdxIndex(url.url);
  const filteredSnapshots = filterSnapshotsByTimestamp(allSnapshots, url.maxTimestamp, url.minTimestamp);
  if (filteredSnapshots.length !== allSnapshots.length) {
    console.log(`Filtered ${allSnapshots.length - filteredSnapshots.length} snapshots for ${url.url} based on timestamp constraints`);
  }
  const resolvedSnapshots = await resolveRevisitSnapshots(filteredSnapshots);
  const { uniqueSnapshots, filteredValidSnapshots, filteredInvalidSnapshots } = await filterDuplicateSnapshots(url.url, includeInvalid && !url.mirrorUrl, resolvedSnapshots);
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
