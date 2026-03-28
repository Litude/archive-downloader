import axios from "axios";
import zlib from "zlib";

export async function fetchWarcGlobalHeader(
  url: string,
  options: { timeout: number; initialBackoff: number; maxBackoff: number },
): Promise<Buffer> {
  let attempt = 0;
  let backoff = options.initialBackoff;
  while (true) {
    try {
      console.log(`Fetching WARC global header from ${url} (attempt ${attempt})...`);
      const response = await axios.get(url, {
        headers: { Range: "bytes=0-" },
        responseType: "stream",
        timeout: options.timeout,
      });
      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalLength = 0;
        let recordTotalSize: number | null = null;
        const gunzip = zlib.createGunzip();
        let settled = false;

        function settle(result: Buffer | Error) {
          if (settled) {
            return;
          }
          settled = true;
          response.data.destroy();
          gunzip.destroy();
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result);
          }
        }

        gunzip.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          totalLength += chunk.length;

          if (recordTotalSize === null) {
            const soFar = Buffer.concat(chunks);
            const headerEnd = soFar.indexOf("\r\n\r\n");
            if (headerEnd !== -1) {
              const headerText = soFar.subarray(0, headerEnd).toString("ascii");
              const contentLengthMatch = headerText.match(/^Content-Length:\s*(\d+)$/im);
              if (contentLengthMatch) {
                const contentLength = parseInt(contentLengthMatch[1], 10);
                // WARC record = headers + \r\n\r\n + payload + \r\n\r\n (trailing)
                recordTotalSize = headerEnd + 4 + contentLength + 4;
              }
            }
          }

          if (recordTotalSize !== null && totalLength >= recordTotalSize) {
            settle(Buffer.concat(chunks).subarray(0, recordTotalSize));
          }
        });
        gunzip.on("end", () => {
          // Stream ended before full record received — return what we have
          settle(Buffer.concat(chunks));
        });
        gunzip.on("error", (err) => settle(err));
        response.data.on("error", (err: unknown) =>
          settle(err instanceof Error ? err : new Error(String(err))),
        );
        response.data.pipe(gunzip);
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error fetching WARC global header from ${url} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, options.maxBackoff);
      attempt++;
    }
  }
}
