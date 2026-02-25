import axios from 'axios';

async function downloadToBufferWithRetry(url: string, requestHeaders: Record<string, string> = {}) {
    while (true) {
        try {
            return await downloadToBuffer(url, requestHeaders);
        } catch (error: unknown) {
            // We want to catch connection refused errors and retry after a delay because the web archive
            // rate limits quite aggressively sometimes
            if (error instanceof Error && "code" in error && error.code === 'ECONNREFUSED') {
                console.log(`Connection refused for ${url}, retrying after 30 seconds...`);
                await new Promise(res => setTimeout(res, 30000));
            } else {
                throw error;
            }
        }
    }
}

async function downloadToBuffer(url: string, requestHeaders: Record<string, string> = {}) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let responseHeaders = {};
  let status = 0;
  let aborted = false;

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 0,
      validateStatus: (status) => status === 200 || status === 206, // Accept both full content and partial content responses
      headers: { 
        'Accept-Encoding': 'identity',
        ...requestHeaders
      }
    });

    responseHeaders = response.headers;
    status = response.status;

    const stream = response.data;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', (err: any) => {
        aborted = true;
        reject(err);
      });
    });

    console.log(`Finished normally with ${totalBytes} bytes`);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === 'ECONNRESET') {
        //console.log(`Stream aborted after ${totalBytes} bytes: ${err instanceof Error ? err.message : String(err)}`);
    }
    else {
        // We assume this is some transient error and re-throw, let caller handle full retry logic
        throw err;
    }
  }

  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    headers: responseHeaders,
    status,
    aborted,
    length: buffer.length
  };
}

async function fetchAllBytes(url: string, maxAttempts = 10) {
  let allChunks = [];
  let offset = 0;
  let total = 0;
  let lastLength = -1;
  let completeDownload = false;
  let responseHeaders: Record<string, string> | undefined = undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rangeHeader = offset ? { Range: `bytes=${offset}-` } : undefined;
    const { buffer, headers, aborted } = await downloadToBufferWithRetry(url, rangeHeader);
    const len = buffer.length;

    console.log(`Partial download attempt ${attempt}: got ${len} bytes (offset ${offset})`);

    if (responseHeaders === undefined) {
      responseHeaders = headers as Record<string, string>;
    }

    if (len === 0 || len === lastLength) {
      console.log(`Attempt ${attempt} yielded no more data — file is likely complete.`);
      break;
    }

    allChunks.push(buffer);
    total += len;
    offset += len;
    lastLength = len;

    if (!aborted) {
      console.log('Stream ended normally — probably finished.');
      completeDownload = true;
      break;
    }
  }

  return {
    buffer: Buffer.concat(allChunks),
    headers: responseHeaders ?? {},
    completeDownload,
  };
}

export async function fetchPartiallyArchivedFileData(url: string) {
    // Example usage:
    const { buffer, headers, completeDownload } = await fetchAllBytes(url);
    let finalBuffer = buffer;
    const fetchedLength = buffer.length;

    if (!completeDownload) {
        const contentLength = headers?.['content-length'] ? parseInt(headers['content-length'], 10) : null;
        const missingBytes = contentLength !== null ? contentLength - buffer.length : 0;
        console.log(`Download incomplete after max attempts: got ${buffer.length} bytes but content size was ${headers?.['content-length']} (missing ${missingBytes} bytes)`);

        if (missingBytes > 0) {
            const paddingBuffer = Buffer.alloc(missingBytes, 0);
            finalBuffer = Buffer.concat([buffer, paddingBuffer]);
        }
    }

    return {
        buffer: finalBuffer,
        headers,
        valid: completeDownload,
        fetchedLength,
    }
}

