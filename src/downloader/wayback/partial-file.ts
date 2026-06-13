import axios from "axios";
import { cleanupAxiosResponseHeaders, preventAxiosRedirects } from "../../utils/axios-utils.js";
import { parseRawHeadersToPairs, RawHeader } from "../../headers/raw-header-parser.js";

async function downloadToBufferWithRetry(
  url: string,
  requestHeaders: Record<string, string> = {},
  statusCode: number,
) {
  while (true) {
    try {
      return await downloadToBuffer(url, requestHeaders, statusCode);
    } catch (error: unknown) {
      // We want to catch connection refused errors and retry after a delay because the web archive
      // rate limits quite aggressively sometimes
      if (error instanceof Error && "code" in error && error.code === "ECONNREFUSED") {
        console.log(`Connection refused for ${url}, retrying after 30 seconds...`);
        await new Promise((res) => setTimeout(res, 30000));
      } else {
        throw error;
      }
    }
  }
}

async function downloadToBuffer(
  url: string,
  requestHeaders: Record<string, string> = {},
  statusCode: number,
) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let responseHeaders: Record<string, string> = {};
  let rawHeaders: RawHeader[] = [];
  let status = 0;
  let statusMessage = "";
  let aborted = false;

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: 60000,
      ...preventAxiosRedirects,
      // Accept both full content and partial content responses, and also allow matching the expected status code (e.g. 404 for not found captures)
      validateStatus: (status) => status === 200 || status === 206 || status === statusCode,
      headers: {
        "Accept-Encoding": "identity",
        ...requestHeaders,
      },
    });

    responseHeaders = cleanupAxiosResponseHeaders(response.headers);
    rawHeaders = parseRawHeadersToPairs(response.request.res.rawHeaders);
    status = response.status;
    statusMessage = response.statusText;

    const stream = response.data;

    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    await new Promise((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", (err: unknown) => {
        aborted = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    console.log(`Finished normally with ${totalBytes} bytes`);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ECONNRESET") {
      //console.log(`Stream aborted after ${totalBytes} bytes: ${err instanceof Error ? err.message : String(err)}`);
    } else {
      // We assume this is some transient error and re-throw, let caller handle full retry logic
      throw err;
    }
  }

  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    headers: responseHeaders,
    rawHeaders,
    status,
    statusMessage,
    aborted,
    length: buffer.length,
  };
}

async function fetchAllBytes(url: string, statusCode: number, maxAttempts = 10) {
  const allChunks = [];
  let offset = 0;
  let lastLength = -1;
  let completeDownload = false;
  let responseHeaders: Record<string, string> | undefined = undefined;
  let responseRawHeaders: RawHeader[] | undefined = undefined;
  let status = 0;
  let statusMessage = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rangeHeader = offset ? { Range: `bytes=${offset}-` } : undefined;
    const {
      buffer,
      headers,
      rawHeaders,
      aborted,
      status: statusOutput,
      statusMessage: statusMessageOutput,
    } = await downloadToBufferWithRetry(url, rangeHeader, statusCode);
    const len = buffer.length;

    console.log(`Partial download attempt ${attempt}: got ${len} bytes (offset ${offset})`);

    if (responseHeaders === undefined) {
      responseHeaders = headers as Record<string, string>;
    }
    if (responseRawHeaders === undefined) {
      responseRawHeaders = rawHeaders;
    }
    if (status === 0) {
      status = statusOutput;
    }
    if (!statusMessage) {
      statusMessage = statusMessageOutput;
    }

    if (len === 0 || len === lastLength) {
      console.log(`Attempt ${attempt} yielded no more data — file is likely complete.`);
      break;
    }

    allChunks.push(buffer);
    offset += len;
    lastLength = len;

    if (!aborted) {
      console.log("Stream ended normally — probably finished.");
      completeDownload = true;
      break;
    }
  }

  return {
    buffer: Buffer.concat(allChunks),
    headers: responseHeaders ?? {},
    rawHeaders: responseRawHeaders ?? [],
    completeDownload,
    statusCode: status,
    statusMessage,
  };
}

export async function fetchPartiallyArchivedFileData(url: string, statusCode: number, padContent: boolean = false) {
  // Example usage:
  const {
    buffer,
    headers,
    rawHeaders,
    completeDownload,
    statusCode: finalStatusCode,
    statusMessage,
  } = await fetchAllBytes(url, statusCode);
  let finalBuffer = buffer;
  const fetchedLength = buffer.length;

  if (!completeDownload) {
    const contentLength = headers?.["content-length"]
      ? parseInt(headers["content-length"], 10)
      : null;
    const missingBytes = contentLength !== null ? contentLength - buffer.length : 0;
    console.log(
      `Download incomplete after max attempts: got ${buffer.length} bytes but content size was ${headers?.["content-length"]} (missing ${missingBytes} bytes)`,
    );

    if (padContent && missingBytes > 0) {
      const paddingBuffer = Buffer.alloc(missingBytes, 0);
      finalBuffer = Buffer.concat([buffer, paddingBuffer]);
    }
  }

  return {
    buffer: finalBuffer,
    headers,
    rawHeaders,
    valid: completeDownload,
    fetchedLength,
    statusCode: finalStatusCode,
    statusMessage,
  };
}
