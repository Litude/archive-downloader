import axios from "axios";
import zlib from "zlib";

export async function fetchArcGlobalHeader(
  url: string,
  options: { timeout: number; initialBackoff: number; maxBackoff: number },
): Promise<Buffer> {
  let attempt = 0;
  let backoff = options.initialBackoff;
  while (true) {
    try {
      console.log(`Fetching ARC global header from ${url} (attempt ${attempt})...`);
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
            const headerEnd = soFar.indexOf("\n");
            if (headerEnd !== -1) {
              const headerText = soFar.subarray(0, headerEnd).toString("ascii");
              const parts = headerText.split(" ");
              // Size is always last, even though number of entries may differ between ARC versions
              const size = parts.at(-1);
              if (size === undefined) {
                settle(new Error("Invalid ARC file: unable to parse header line"));
                return;
              }

              const contentLength = parseInt(size, 10);
              // We assume that the content length does NOT include any new lines, and then at the end we trim the result to only
              // include the final newline character
              recordTotalSize = headerEnd + 1 + contentLength + 2;
            }
          }

          if (recordTotalSize !== null && totalLength >= recordTotalSize) {
            // In practice, it is not specified in the ARC specification whether the trailing newlines (2x) are included in the size
            // or not. We assume that they are not included, and we trim the result to remove any non-newline characters at the end.
            const merged = Buffer.concat(chunks);
            let nonNewlineCharactersAtEnd = 0;
            for (let i = merged.length - 1; i >= 0; i--) {
              const byte = merged[i];
              if (byte !== 0x0a) {
                nonNewlineCharactersAtEnd++;
              } else {
                break;
              }
            }
            settle(merged.subarray(0, totalLength - nonNewlineCharactersAtEnd));
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
        `Error fetching ARC global header from ${url} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, options.maxBackoff);
      attempt++;
    }
  }
}
