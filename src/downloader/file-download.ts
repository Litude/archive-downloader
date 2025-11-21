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

function getResponse(waybackUrl: string, statusCode: string) {
  if (statusCode && !statusCode.startsWith('2')) {
    if (["301", "302"].includes(statusCode)) {
      return axios.get(waybackUrl, { headers: REQUEST_HEADERS, responseType: 'arraybuffer', maxRedirects: 0, validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
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

function getResponseHeaders(waybackUrl: string, statusCode: string) {
  if (statusCode && !statusCode.startsWith('2')) {
    if (["301", "302"].includes(statusCode)) {
      return axios.head(waybackUrl, { headers: REQUEST_HEADERS, maxRedirects: 0, validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
    }
    else if (["404"].includes(statusCode)) {
      return axios.head(waybackUrl, { headers: REQUEST_HEADERS, validateStatus: status => status === Number(statusCode), timeout: REQUEST_TIMEOUT });
    }
    else {
      throw new Error(`Unsupported status code for special fetch: ${statusCode}`);
    }
  }
  else {
    return axios.head(waybackUrl, { headers: REQUEST_HEADERS, timeout: REQUEST_TIMEOUT });
  }
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
      const content = Buffer.from(response.data);
      return { content, url, timestamp, headers: response.headers, corrupt: false, statusCode: response.status.toString() };
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
    statusCode: string
): Promise<Omit<DownloadedFile, 'content' | 'corrupt'>> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching file headers for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponseHeaders(waybackUrl, statusCode);
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { url, timestamp, headers: response.headers, statusCode: response.status.toString() };
    } catch (e: unknown) {
      console.log(`Error fetching headers for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
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
      return { content, url, timestamp, headers: response.headers, corrupt: true, statusCode: response.status.toString() };
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
        corrupt: !valid,
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
