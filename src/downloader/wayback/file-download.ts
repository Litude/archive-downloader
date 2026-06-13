import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path, { dirname } from "path";
import JSON5 from "json5";
import { fileURLToPath } from "url";
import { fetchPartiallyArchivedFileData } from "./partial-file.js";
import { DownloadedFile } from "../../types/download-types.js";
import { cleanupAxiosResponseHeaders, preventAxiosRedirects } from "../../utils/axios-utils.js";
import { ExtendedCdxEntry } from "../../types/wayback-types.js";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_MAX_BACKOFF } from "./wayback-common.js";
import { parseRawHeadersToPairs } from "../../headers/raw-header-parser.js";
import { getWaybackCaptureBaseUrl } from "./utils/wayback-url.js";
import { isUrlTrailingSlashMatch, TrailingSlashParsingMode } from "../../url/trailing-slash.js";
import { Context } from "../../types/context.js";
import { isWaybackCaptureResponse } from "./utils/wayback-capture.js";
import { toDownloaderError } from "../../utils/downloader-error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_ARCHIVE = "web.archive.org/web";
const REQUEST_TIMEOUT = 60_000; // 60 seconds
const INITIAL_BACKOFF = WAYBACK_INITIAL_BACKOFF; // 30 seconds
const MAX_BACKOFF = WAYBACK_MAX_BACKOFF; // 5 minutes
const REDIRECT_MAX_BACKOFF = 30_000; // 30 seconds

const ERROR_STATUS_CODES = [429, 502, 503, 504];
export const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
const REQUEST_HEADERS = {
  "Accept-Encoding": "identity",
};

const selfRedirectUrls: { url: string; minTimestamp?: string }[] = JSON5.parse(
  fs.readFileSync(path.join(__dirname, "../../../data/settings/self_redirect_urls.json"), "utf-8"),
);

// The precedence for responses is as follows:
// 1. Expected status code with x-archive-src header (indicates the original capture is returned); this should never happen since such responses are immediately returned without calling this function
// 2. Expected status code without x-archive-src header (self redirect)
// 3. 301 or 302 response without x-archive-src header (self redirect, 301 might return 302 for these cases)
// 4. 404 response without x-archive-src header (self redirect with no actual capture available)
function isBetterRedirectResponse(
  response: AxiosResponse<any>,
  expectedStatusCode: number,
  bestResponse: AxiosResponse<any> | null,
): boolean {
  if (![301, 302, 404].includes(response.status)) {
    return false;
  }

  if (!bestResponse) {
    return true;
  }
  // This means we got the actual capture, but this function is not actually called in such cases
  if (response.status === expectedStatusCode && response.headers["x-archive-src"]) {
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

async function attemptToFetchRedirectUrl(
  waybackUrl: string,
  expectedStatusCode: number,
  requestUrl?: string,
): Promise<AxiosResponse<any>> {
  let errorAttempt = 0;
  let responseAttempt = 0;
  // 301 or 302 captures can be redirects from non-www to www and these captures are not available, so we attempt these captures fewer times before assuming they are unavailable.
  const baseUrlInfo = getWaybackCaptureBaseUrl(waybackUrl);
  const isPotentialSelfRedirect =
    baseUrlInfo &&
    (selfRedirectUrls.some(
      (url) =>
        baseUrlInfo.originalUrl.startsWith(url.url) &&
        (!url.minTimestamp || baseUrlInfo.timestamp >= url.minTimestamp),
    ) ||
      (requestUrl &&
        !isUrlTrailingSlashMatch(
          baseUrlInfo.originalUrl,
          requestUrl,
          TrailingSlashParsingMode.Strict,
        )));
  const maxAttempts = isPotentialSelfRedirect ? 1 : 5;
  let bestResponse: AxiosResponse<any> | null = null;
  let errorBackoff = INITIAL_BACKOFF;
  let responseBackoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const response = await axios.get(waybackUrl, {
        headers: REQUEST_HEADERS,
        responseType: "arraybuffer",
        maxRedirects: 0,
        validateStatus: (status) => [301, 302, 404].includes(status),
        timeout: REQUEST_TIMEOUT,
      });
      if (response.status === Number(expectedStatusCode) && response.headers["x-archive-src"]) {
        return response;
      }

      if (isBetterRedirectResponse(response, expectedStatusCode, bestResponse)) {
        bestResponse = response;
      }

      responseAttempt++;
      if (responseAttempt >= maxAttempts && bestResponse) {
        if (isPotentialSelfRedirect) {
          if (response.status !== expectedStatusCode) {
            console.log(
              `Received ${response.status} for ${waybackUrl} which was expected to be a ${expectedStatusCode} after ${responseAttempt} attempts. Assuming that the capture is unavailable.`,
            );
          } else {
            console.log(
              `Received expected status code ${expectedStatusCode} for ${waybackUrl} after ${responseAttempt} attempts but without x-archive-src header. Assuming that the capture is unavailable.`,
            );
          }
          return bestResponse;
        } else {
          console.log(
            `Received ${expectedStatusCode} for ${waybackUrl} ${responseAttempt} times, assuming the capture is unavailable.`,
          );
          return bestResponse;
        }
      }
      if (expectedStatusCode !== response.status) {
        console.log(
          `Received ${response.status} for ${waybackUrl} which was expected to be a ${expectedStatusCode}. Retrying in ${responseBackoff / 1000} seconds (Attempt ${responseAttempt}/${maxAttempts})`,
        );
      } else {
        console.log(
          `Received expected status code ${expectedStatusCode} for ${waybackUrl} but without x-archive-src header. Retrying in ${responseBackoff / 1000} seconds (Attempt ${responseAttempt})`,
        );
      }
      await new Promise((res) => setTimeout(res, responseBackoff));
      responseBackoff = Math.min(responseBackoff * 2, MAX_BACKOFF);
    } catch (e: unknown) {
      errorAttempt++;
      console.log(
        `Error while attempting to fetch redirect URL for ${waybackUrl}: ${e}. Retrying in ${errorBackoff / 1000} seconds (Attempt ${errorAttempt})`,
      );
      await new Promise((res) => setTimeout(res, errorBackoff));
      errorBackoff = Math.min(errorBackoff * 2, MAX_BACKOFF);
    }
  }
}

async function getResponse(waybackUrl: string, statusCode: number, requestUrl?: string) {
  if (statusCode && statusCode >= 300) {
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      // 302 can also be returned by the web archive when the capture is temporarily unavailable. And incase the original 302 capture was a self redirect, the response will be identical to an unavailable capture.
      // Best we can do is attempt a few times and if we keep getting 302 responses, we can assume the capture is unavailable
      return attemptToFetchRedirectUrl(waybackUrl, statusCode, requestUrl);
    } else {
      return axios.get(waybackUrl, {
        headers: REQUEST_HEADERS,
        ...preventAxiosRedirects,
        responseType: "arraybuffer",
        validateStatus: (status) => status === statusCode,
        timeout: REQUEST_TIMEOUT,
      });
    }
  } else {
    return axios.get(waybackUrl, {
      headers: REQUEST_HEADERS,
      responseType: "arraybuffer",
      ...preventAxiosRedirects,
      validateStatus: (status) => status === Number(statusCode),
      timeout: REQUEST_TIMEOUT,
    });
  }
}

function getResponseHeaders(waybackUrl: string) {
  return axios.head(waybackUrl, {
    headers: REQUEST_HEADERS,
    maxRedirects: 0,
    timeout: REQUEST_TIMEOUT,
    validateStatus: null,
  });
}

export async function fetchWaybackFile(
  timestamp: string,
  url: string,
  statusCode: number,
  requestUrl?: string,
  context?: Context,
): Promise<DownloadedFile> {
  let attempt = 1;
  let headersErrorCount = 0;
  let abortedCount = 0;
  let redirectCount = 0;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const waybackUrl = createWaybackDownloadUrl(timestamp, url, attempt - 1);
      console.log(`Fetching file content for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponse(waybackUrl, statusCode, requestUrl);
      if (!response.headers["x-archive-src"] && !REDIRECT_STATUS_CODES.includes(statusCode)) {
        throw new Error(`HTTP ${response.status}`);
      }
      const classification =
        REDIRECT_STATUS_CODES.includes(statusCode) && !response.headers["x-archive-src"]
          ? "unavailable"
          : undefined;
      const content = Buffer.from(response.data);
      return {
        content,
        url,
        timestamp,
        responseHeaders: cleanupAxiosResponseHeaders(response.headers),
        rawResponseHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders),
        classification,
        statusCode: response.status,
        statusMessage: response.statusText,
      };
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "incorrect header check") {
        // This seems to happen sometimes with corrupted gzip data
        backoff = INITIAL_BACKOFF;
        console.log(`Decompression error for ${url}, retrying in ${backoff / 1000}s...`);
        headersErrorCount++;
        await new Promise((res) => setTimeout(res, backoff));
        if (headersErrorCount >= 3) {
          console.log(
            `Repeated header check errors for ${url}, attempting to fetch without decompression...`,
          );
          return fetchCorruptWaybackFileWithoutDecompression(timestamp, url);
        }
      } else if (e instanceof Error && e.message === "stream has been aborted") {
        backoff = INITIAL_BACKOFF;
        console.log(`Stream aborted for ${url}, retrying in ${backoff / 1000}s...`);
        abortedCount++;
        await new Promise((res) => setTimeout(res, backoff));
        if (abortedCount >= 3) {
          console.log(
            `Repeated stream abort errors for ${url}, attempting to fetch partial file...`,
          );
          return fetchPartialFile(timestamp, url, statusCode);
        }
      } else if (
        e instanceof Error &&
        e.message.includes("Unexpected redirect...") &&
        context?.settings.skipOn302
      ) {
        ++redirectCount;
        if (redirectCount >= (context.settings.skipOn302 || 0)) {
          console.log(
            `Received ${redirectCount} unexpected redirect errors for ${url}. Skipping this file.`,
          );
          return {
            content: Buffer.alloc(0),
            url,
            timestamp,
            responseHeaders: {},
            rawResponseHeaders: [],
            classification: "unavailable",
            statusCode: 0,
            statusMessage: "Unexpected redirect - skipped",
          };
        }
        console.log(
          `Error fetching file for ${url}: unexpected redirect (attempt ${attempt} / ${context.settings.skipOn302}), retrying in ${backoff / 1000}s...`,
        );
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, REDIRECT_MAX_BACKOFF);
      } else {
        console.log(`Error fetching file for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      }
      attempt++;
    }
  }
}

export async function fetchWaybackFileHeaders(
  timestamp: string,
  url: string,
  statusCodes: number[] | undefined,
  {
    allow404 = false,
    allowSlashRedirect = false,
  }: { allow404?: boolean; allowSlashRedirect?: boolean } = {},
  context: Context,
): Promise<Omit<DownloadedFile, "content" | "corrupt">> {
  let attempt = 1;
  let redirectCount = 0;
  let error404Attempts = 0;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      const waybackUrl = createWaybackDownloadUrl(timestamp, url, attempt - 1);
      console.log(`Fetching file headers for ${timestamp}-${url} (attempt ${attempt})...`);
      const response = await getResponseHeaders(waybackUrl);

      // Special case when duplicate captures exist with the same timestamp where one is a redirect and the other one is not,
      // we might be looking up the redirect capture url and wayback redirects to the non-redirect url (one might have a trailing slash, the other one does not)
      if (allowSlashRedirect && response.status === 302 && !url.endsWith("/")) {
        const redirectLocation = response.headers["location"] ?? "";
        const { timestamp: redirectTimestamp } = getWaybackCaptureBaseUrl(redirectLocation) ?? {};
        if (redirectLocation.endsWith("/") && redirectTimestamp === timestamp) {
          console.log(
            `Received 302 redirect to ${redirectLocation} for ${timestamp}-${url}, which seems to be a self redirect to the same capture with a trailing slash. Attempting to fetch headers for the redirected URL...`,
          );
          return fetchWaybackFileHeaders(
            timestamp,
            url + "/",
            statusCodes,
            { allow404, allowSlashRedirect: false },
            context,
          );
        }
      }

      if (!isWaybackCaptureResponse(response)) {
        if (response.status === 302 && context?.settings.skipOn302) {
          redirectCount++;
          if (redirectCount >= context.settings.skipOn302) {
            console.log(
              `Received ${redirectCount} unexpected redirect errors for ${url}. Skipping this file.`,
            );
            return {
              url,
              timestamp,
              responseHeaders: {},
              rawResponseHeaders: [],
              classification: "unavailable",
              statusCode: response.status,
              statusMessage: response.statusText,
            };
          }
          const downloadError = toDownloaderError(
            new Error(
              `Unexpected redirect for ${url} (attempt ${attempt} / ${context.settings.skipOn302})`,
            ),
          );
          downloadError.errorType = "unexpected_redirect";
          throw downloadError;
        } else {
          throw new Error(`HTTP ${response.status} missing x-archive-src header`);
        }
      } else if (allow404 && response.status === 404) {
        ++error404Attempts;
        if (error404Attempts >= 3) {
          console.log(
            `Received 404 status code when fetching headers for ${timestamp}-${url} multiple times, but skipping due to settings.`,
          );
          return {
            url,
            timestamp,
            responseHeaders: {},
            rawResponseHeaders: [],
            classification: "unavailable",
            statusCode: response.status,
            statusMessage: response.statusText,
          };
        }
        throw new Error(
          `Received 404 status code when fetching headers for ${timestamp}-${url}, will attempt for ${3 - error404Attempts} more times before skipping.`,
        );
      } else if (statusCodes && !statusCodes.includes(response.status)) {
        throw new Error(
          `HTTP ${response.status} does not match expected status codes ${statusCodes.join(", ")}`,
        );
      }
      return {
        url,
        timestamp,
        responseHeaders: cleanupAxiosResponseHeaders(response.headers),
        rawResponseHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders),
        statusCode: response.status,
        statusMessage: response.statusText,
      };
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        toDownloaderError(e).errorType === "unexpected_redirect" &&
        context?.settings.skipOn302
      ) {
        console.log(
          `Error fetching headers for ${timestamp}-${url}: ${e} (attempt ${attempt} / ${context.settings.skipOn302}), retrying in ${backoff / 1000}s...`,
        );
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, REDIRECT_MAX_BACKOFF);
        attempt++;
        continue;
      } else {
        console.log(
          `Error fetching headers for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`,
        );
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        attempt++;
      }
    }
  }
}

function createWaybackDownloadUrl(timestamp: string, url: string, attempt?: number): string {
  const protocol = (attempt || 0) % 2 === 0 ? "http" : "https";
  return `${protocol}://${WEB_ARCHIVE}/${timestamp}id_/${url.replaceAll("\\", "%5C")}`;
}

export async function fetchCorruptWaybackFileWithoutDecompression(
  timestamp: string,
  url: string,
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching raw file content for ${url} (attempt ${attempt})...`);
      const response = await axios.get(waybackUrl, {
        decompress: false,
        ...preventAxiosRedirects,
        responseType: "arraybuffer",
        timeout: REQUEST_TIMEOUT,
      });
      if (ERROR_STATUS_CODES.includes(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = Buffer.from(response.data);
      const contentLength = response.headers["content-length"]
        ? parseInt(response.headers["content-length"], 10)
        : undefined;
      return {
        content,
        url,
        timestamp,
        responseHeaders: cleanupAxiosResponseHeaders(response.headers),
        rawResponseHeaders: parseRawHeadersToPairs(response.request.res.rawHeaders),
        metadata: {
          downloadErrorDetails: {
            reason: "truncated",
            downloadedSize: content.length,
            actualSize:
              contentLength !== undefined && contentLength !== content.length
                ? contentLength
                : null,
          },
        },
        classification: "corrupt",
        statusCode: response.status,
        statusMessage: response.statusText,
      };
    } catch (e: unknown) {
      console.log(`Error fetching raw file for ${url}: ${e}, retrying in ${backoff / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

async function fetchPartialFile(
  timestamp: string,
  url: string,
  statusCode: number,
): Promise<DownloadedFile> {
  const waybackUrl = createWaybackDownloadUrl(timestamp, url);
  let attempt = 1;
  let backoff = INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching partial file content for ${timestamp}-${url} (attempt ${attempt})...`);
      const {
        buffer,
        headers,
        rawHeaders,
        valid,
        fetchedLength,
        statusCode: finalStatusCode,
        statusMessage,
      } = await fetchPartiallyArchivedFileData(waybackUrl, statusCode);
      const contentLength = headers["content-length"]
        ? parseInt(headers["content-length"], 10)
        : undefined;
      return {
        content: buffer,
        url,
        timestamp,
        responseHeaders: headers,
        rawResponseHeaders: rawHeaders,
        classification: !valid ? "corrupt" : undefined,
        metadata: !valid
          ? {
              downloadErrorDetails: {
                reason: "truncated",
                downloadedSize: fetchedLength,
                actualSize:
                  contentLength !== undefined && contentLength !== fetchedLength
                    ? contentLength
                    : null,
              },
            }
          : {},
        statusCode: finalStatusCode,
        statusMessage,
      };
    } catch (e: unknown) {
      console.log(
        `Error fetching partial file for ${timestamp}-${url}: ${e}, retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      attempt++;
    }
  }
}

export async function downloadUniqueDigestsForSnapshots(
  input: ExtendedCdxEntry[],
  context: Context,
): Promise<Map<string, DownloadedFile>> {
  const uniqueDigestCount = new Set(input.map((entry) => entry.digest)).size;
  console.log(`Unique digests to download: ${uniqueDigestCount}`);
  let currentDigest = 0;
  const encounteredDigests = new Map<string, DownloadedFile>();
  const unavailableDigests = new Map<string, DownloadedFile>();
  for (const entry of input) {
    if (entry.digest && !encounteredDigests.has(entry.digest)) {
      console.log(
        `Downloading snapshot ${entry.timestamp} for URL ${entry.url} (${++currentDigest}/${uniqueDigestCount})`,
      );
      const result = await fetchWaybackFile(
        entry.timestamp,
        entry.url,
        entry.status ?? 0,
        entry.requestUrl,
        context,
      );
      if (result.classification !== "unavailable") {
        encounteredDigests.set(entry.digest, result);
      } else if (!unavailableDigests.has(entry.digest)) {
        unavailableDigests.set(entry.digest, result);
      }
    }
  }
  // Populate unavailable if no version of digest was successfully downloaded
  unavailableDigests.forEach((value, key) => {
    if (!encounteredDigests.has(key)) {
      encounteredDigests.set(key, value);
    }
  });
  return encounteredDigests;
}
