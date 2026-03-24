import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { fetchPartiallyArchivedFileData } from "./partial-file";
import { DownloadedFile } from "../../types/download-types";
import { preventAxiosRedirects } from "../../utils/axios-utils";
import { getWaybackCaptureBaseUrl } from "../../utils/address";
import { CdxEntry } from "../../types/wayback-types";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF } from "./wayback-common";
import { parseRawHeadersToPairs } from "../../utils/raw-header-parser";

const WEB_ARCHIVE = 'web.archive.org/web';
const REQUEST_TIMEOUT = 60_000; // 60 seconds
const INITIAL_BACKOFF = WAYBACK_INITIAL_BACKOFF; // 30 seconds
const MAX_BACKOFF = WAYBACK_MAX_BACKOFF; // 10 minutes

const ERROR_STATUS_CODES = [429, 502, 503, 504];
const REQUEST_HEADERS = {
  'Accept-Encoding': 'identity'
};

const selfRedirectUrls: { url: string, minTimestamp?: string }[] = JSON5.parse(
    fs.readFileSync(
        path.join(__dirname, '../../../data/settings/self_redirect_urls.json'), 'utf-8'
    )
);

// The precedence for responses is as follows:
// 1. Expected status code with x-archive-src header (indicates the original capture is returned); this should never happen since such responses are immediately returned without calling this function
// 2. Expected status code without x-archive-src header (self redirect)
// 3. 301 or 302 response without x-archive-src header (self redirect, 301 might return 302 for these cases)
// 4. 404 response without x-archive-src header (self redirect with no actual capture available)
function isBetterRedirectResponse(response: AxiosResponse<any>, expectedStatusCode: number, bestResponse: AxiosResponse<any> | null): boolean {
  if (![301, 302, 404].includes(response.status)) {
    return false;
  }

  if (!bestResponse) {
    return true;
  }
  // This means we got the actual capture, but this function is not actually called in such cases
  if (response.status === expectedStatusCode && response.headers['x-archive-src']) {
    return true;
  }
  if (bestResponse.status === expectedStatusCode) {
    return false;
  }
  if (response.status === expectedStatusCode) {
    return true;
  }

  if (bestResponse.status === 404 && [301, 302].includes(response.status)) {
    return true;
  }

  return false;
}

async function attemptToFetchRedirectUrl(waybackUrl: string, expectedStatusCode: number): Promise<AxiosResponse<any>> {
  let errorAttempt = 0;
  let responseAttempt = 0;
  // 301 or 302 captures can be redirects from non-www to www and these captures are not available, so we attempt these captures fewer times before assuming they are unavailable.
  const baseUrlInfo = getWaybackCaptureBaseUrl(waybackUrl);
  const isPotentialSelfRedirect = baseUrlInfo && selfRedirectUrls.some(url => baseUrlInfo.originalUrl.startsWith(url.url) && (!url.minTimestamp || baseUrlInfo.timestamp >= url.minTimestamp));
  const maxAttempts = isPotentialSelfRedirect ? 1 : 5;
  let bestResponse: AxiosResponse<any> | null = null;
  let errorBackoff = INITIAL_BACKOFF;
  let responseBackoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const response = await axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', maxRedirects: 0, validateStatus: (status) => [301, 302, 404].includes(status), timeout: REQUEST_TIMEOUT });
      if (response.status === Number(expectedStatusCode) && response.headers['x-archive-src']) {
        return response;
      }

      if (isBetterRedirectResponse(response, expectedStatusCode, bestResponse)) {
        bestResponse = response;
      }

      responseAttempt++;
      if (responseAttempt >= maxAttempts && bestResponse) {
        if (isPotentialSelfRedirect) {
          if (response.status !== expectedStatusCode) {
            console.log(`Received ${response.status} for ${waybackUrl} which was expected to be a ${expectedStatusCode} after ${responseAttempt} attempts. Assuming that the capture is unavailable.`);
          }
          else {
            console.log(`Received expected status code ${expectedStatusCode} for ${waybackUrl} after ${responseAttempt} attempts but without x-archive-src header. Assuming that the capture is unavailable.`);
          }
          return bestResponse;
        }
        else {
          console.log(`Received ${expectedStatusCode} for ${waybackUrl} ${responseAttempt} times, assuming the capture is unavailable.`);
          return bestResponse;
        }
      }
      if (expectedStatusCode !== response.status) {
        console.log(`Received ${response.status} for ${waybackUrl} which was expected to be a ${expectedStatusCode}. Retrying in ${responseBackoff / 1000} seconds (Attempt ${responseAttempt})`);
      }
      else {
        console.log(`Received expected status code ${expectedStatusCode} for ${waybackUrl} but without x-archive-src header. Retrying in ${responseBackoff / 1000} seconds (Attempt ${responseAttempt})`);
      }
      await new Promise(res => setTimeout(res, responseBackoff));
      responseBackoff = Math.min(responseBackoff * 2, MAX_BACKOFF);
    } catch (e: unknown) {
      errorAttempt++;
      console.log(`Error while attempting to fetch redirect URL for ${waybackUrl}: ${e}. Retrying in ${errorBackoff / 1000} seconds (Attempt ${errorAttempt})`);
      await new Promise(res => setTimeout(res, errorBackoff));
      errorBackoff = Math.min(errorBackoff * 2, MAX_BACKOFF);
    }
  }
}

async function getResponse(waybackUrl: string, statusCode: number) {
  if (statusCode && statusCode >= 300) {
    if ([301, 302].includes(statusCode)) {
      // 302 can also be returned by the web archive when the capture is temporarily unavailable. And incase the original 302 capture was a self redirect, the response will be identical to an unavailable capture.
      // Best we can do is attempt a few times and if we keep getting 302 responses, we can assume the capture is unavailable
      return attemptToFetchRedirectUrl(waybackUrl, statusCode);
    }
    else if ([403, 404].includes(statusCode)) {
      return axios.get(waybackUrl, { headers: REQUEST_HEADERS, ...preventAxiosRedirects, responseType: 'arraybuffer', validateStatus: status => status === statusCode, timeout: REQUEST_TIMEOUT });
    }
    else {
      throw new Error(`Unsupported status code for special fetch: ${statusCode}`);
    }
  }
  else {
    return axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', ...preventAxiosRedirects, validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
  }
}

function getResponseHeaders(waybackUrl: string, statusCodes?: number[]) {
  return axios.head(
    waybackUrl, {
      headers: REQUEST_HEADERS,
      maxRedirects: 0,
      timeout: REQUEST_TIMEOUT,
      validateStatus: status => (statusCodes ? statusCodes.includes(status) : true)
    }
  );
}

export async function fetchWaybackFile(
    timestamp: string,
    url: string,
    statusCode: number
): Promise<DownloadedFile> {
  let attempt = 1;
  let headersErrorCount = 0;
  let abortedCount = 0;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const waybackUrl = createWaybackDownloadUrl(timestamp, url, attempt - 1);
      console.log(`Fetching file content for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponse(waybackUrl, statusCode);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`)
      };
      const classification = [301, 302].includes(statusCode) && !response.headers['x-archive-src'] ? "unavailable" : undefined;
      const content = Buffer.from(response.data);
      return {
        content,
        url,
        timestamp,
        headers: response.headers,
        rawHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders),
        classification,
        statusCode: response.status
      };
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "incorrect header check") {
        // This seems to happen sometimes with corrupted gzip data
        backoff = INITIAL_BACKOFF;
        console.log(`Decompression error for ${url}, retrying in ${backoff / 1000}s...`);
        headersErrorCount++;
        await new Promise(res => setTimeout(res, backoff));
        if (headersErrorCount >= 3) {
          console.log(`Repeated header check errors for ${url}, attempting to fetch without decompression...`);
          return fetchCorruptFileWithoutDecompression(timestamp, url);
        }
      }
      else if (e instanceof Error && e.message === "stream has been aborted") {
        backoff = INITIAL_BACKOFF;
        console.log(`Stream aborted for ${url}, retrying in ${backoff / 1000}s...`);
        abortedCount++;
        await new Promise(res => setTimeout(res, backoff));
        if (abortedCount >= 3) {
          console.log(`Repeated stream abort errors for ${url}, attempting to fetch partial file...`);
          return fetchPartialFile(timestamp, url, statusCode);
        }
      }
      else {
        console.log(`Error fetching file for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
        await new Promise(res => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      }
      attempt++;
    }
  }
}

export async function fetchWaybackFileHeaders(
  timestamp: string,
  url: string,
  statusCodes?: number[]
): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const waybackUrl = createWaybackDownloadUrl(timestamp, url, attempt - 1);
      console.log(`Fetching file headers for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponseHeaders(waybackUrl, statusCodes);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { url, timestamp, headers: response.headers, rawHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders), statusCode: response.status };
    } catch (e: unknown) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

function createWaybackDownloadUrl(timestamp: string, url: string, attempt?: number): string {
  const protocol = (attempt || 0) % 2 === 0 ? 'http' : 'https';
  return `${protocol}://${WEB_ARCHIVE}/${timestamp}id_/${url.replaceAll('\\', '%5C')}`;
}

async function fetchCorruptFileWithoutDecompression(
    timestamp: string,
    url: string
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching raw file content for ${url} (attempt ${attempt})...`);
      const response = await axios.get(waybackUrl, { decompress: false, ...preventAxiosRedirects, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT });
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = Buffer.from(response.data);
      const contentLength = response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : undefined;
      return {
        content,
        url,
        timestamp,
        headers: response.headers,
        rawHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders),
        metadata: {
          downloadErrorDetails: {
            reason: "truncated",
            downloadedSize: content.length,
            actualSize: contentLength !== undefined && contentLength !== content.length ? contentLength : null
          },
        },
        classification: "corrupt",
        statusCode: response.status
      };
    } catch (e: unknown) {
      console.log(`Error fetching raw file for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

async function fetchPartialFile(
    timestamp: string,
    url: string,
    statusCode: number
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching partial file content for ${timestamp}-${url} (attempt ${attempt})...`);
      const { buffer, headers, rawHeaders, valid, fetchedLength } = await fetchPartiallyArchivedFileData(waybackUrl, statusCode);
      const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : undefined;
      return {
        content: buffer,
        url,
        timestamp,
        headers,
        rawHeaders,
        classification: !valid ? "corrupt" : undefined,
        metadata: !valid ? {
          downloadErrorDetails: {
            reason: "truncated",
            downloadedSize: fetchedLength,
            actualSize: contentLength !== undefined && contentLength !== fetchedLength ? contentLength : null
          },
        } : {},
        statusCode
      };
    } catch (e: unknown) {
      console.log(`Error fetching partial file for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

export async function downloadUniqueDigestsForSnapshots(input: CdxEntry[]): Promise<Map<string, DownloadedFile>> {
    const uniqueDigestCount = new Set(input.map(entry => entry.digest)).size;
    console.log(`Unique digests to download: ${uniqueDigestCount}`);
    let currentDigest = 0;
    const encounteredDigests = new Map<string, DownloadedFile>();
    for (const entry of input) {
        if (entry.digest && !encounteredDigests.has(entry.digest)) {
            console.log(`Downloading snapshot ${entry.timestamp} for URL ${entry.url} (${++currentDigest}/${uniqueDigestCount})`);
            const result = await fetchWaybackFile(entry.timestamp, entry.url, entry.status ?? 0);
            encounteredDigests.set(entry.digest, result);
        }
    }
    return encounteredDigests;
}
