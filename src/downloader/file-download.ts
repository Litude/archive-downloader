import axios from "axios";
import { fetchPartiallyArchivedFileData } from "./partial-file";
import { DownloadedFile } from "../types/download-types";

const WEB_ARCHIVE = 'http://web.archive.org/web';
const REQUEST_TIMEOUT = 60_000; // 60 seconds
const INITIAL_BACKOFF = 30_000; // 30 seconds
const MAX_BACKOFF = 600_000; // 10 minutes

const ERROR_STATUS_CODES = [429, 502, 503, 504];
const REQUEST_HEADERS = {
  'Accept-Encoding': 'identity'
};

async function getResponse(waybackUrl: string, statusCode: string) {
  if (statusCode && !statusCode.startsWith('2')) {
    if (["302"].includes(statusCode)) {
      return axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', maxRedirects: 0, validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
    }
    else if (["301"].includes(statusCode)) {
      // Sometimes 301 captures seem to be unavailable (web archive instead returns 302 to a different capture)
      const response = await axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', maxRedirects: 0, validateStatus: status => status === 301 || status === 302, timeout: REQUEST_TIMEOUT });
      if (response.status === 301) {
        return response;
      } else {
        if (response.headers['x-archive-redirect-reason'].startsWith('found capture at')) {
          return response;
        }
        else {
          throw new Error(`Expected 301 response but got ${response.status} for ${waybackUrl}`);
        }
      }
    }
    else if (["404"].includes(statusCode)) {
      return axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
    }
    else {
      throw new Error(`Unsupported status code for special fetch: ${statusCode}`);
    }
  }
  else {
    return axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT });
  }
}

function getResponseHeaders(waybackUrl: string, statusCodes?: string[]) {
  return axios.head(
    waybackUrl, {
      headers: REQUEST_HEADERS,
      maxRedirects: 0,
      timeout: REQUEST_TIMEOUT,
      validateStatus: status => (statusCodes ? statusCodes.includes(status.toString()) : true)
    }
  );
}

function getRevisitFileHeaders(waybackUrl: string) {
  return axios.head(waybackUrl, { headers: REQUEST_HEADERS,  maxRedirects: 0, validateStatus: status => [200, 301, 302, 404].includes(status), timeout: REQUEST_TIMEOUT });
}

export async function fetchWaybackFile(
    timestamp: string,
    url: string,
    statusCode: string
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let headersErrorCount = 0;
  let abortedCount = 0;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching file content for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponse(waybackUrl, statusCode);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`)
      };
      const classification = statusCode === "301" && response.status === 302 ? "unavailable" : undefined;
      const content = Buffer.from(response.data);
      return { content, url, timestamp, headers: response.headers, classification, statusCode: response.status.toString() };
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
          return fetchPartialFile(timestamp, url);
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
  statusCodes?: string[]
): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching file headers for ${timestamp}-${url} (attempt ${attempt})...`);
      // TODO: Need some robust way to detect if the response is an error page (e.g. 404 page from web archive) instead of the actual capture
      // Perhaps the presence of some specific header, e.g. x-archive-src or memento-datetime could be used?
      const response = await getResponseHeaders(waybackUrl, statusCodes);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { url, timestamp, headers: response.headers, statusCode: response.status.toString() };
    } catch (e: unknown) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

export async function fetchWaybackRevisitFileHeaders(
  timestamp: string,
  url: string
): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching file headers for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getRevisitFileHeaders(waybackUrl);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { url, timestamp, headers: response.headers, statusCode: response.status.toString() };
    } catch (e: unknown) {
      console.log(`Error fetching headers for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

function createWaybackDownloadUrl(timestamp: string, url: string): string {
    return `${WEB_ARCHIVE}/${timestamp}id_/${url.replaceAll('\\', '%5C')}`;
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
      const response = await axios.get(waybackUrl, { decompress: false, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT });
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = Buffer.from(response.data);
      return { content, url, timestamp, headers: response.headers, classification: "corrupt", statusCode: response.status.toString() };
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
    url: string
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching partial file content for ${url} (attempt ${attempt})...`);
      const { buffer, headers, valid, fetchedLength } = await fetchPartiallyArchivedFileData(waybackUrl);
      return {
        content: buffer,
        url,
        timestamp,
        headers,
        classification: !valid ? "corrupt" : undefined,
        metadata: !valid ? {
            downloadedSize: fetchedLength.toString(),
            actualSize: headers['content-length'] ? headers['content-length'].toString() : undefined
        } : {},
        statusCode: '200'
      };
    } catch (e: unknown) {
      console.log(`Error fetching partial file for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise(res => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}
