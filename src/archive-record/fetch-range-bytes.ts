import axios from "axios";
import zlib from "zlib";

export async function fetchRawRangeBytes(
  url: string,
  offset: number,
  length: number,
  options: { timeout: number; initialBackoff: number; maxBackoff: number },
): Promise<Buffer> {
  const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
  let attempt = 0;
  let backoff = options.initialBackoff;
  while (true) {
    try {
      console.log(`Fetching raw range ${rangeHeader} from ${url} (attempt ${attempt})...`);
      const response = await axios.get(url, {
        headers: { Range: rangeHeader },
        responseType: "arraybuffer",
        timeout: options.timeout,
      });
      return Buffer.from(response.data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error fetching raw range ${rangeHeader} from ${url} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, options.maxBackoff);
      attempt++;
    }
  }
}

export async function fetchRangeBytes(
  url: string,
  offset: number,
  length: number,
  options: { timeout: number; initialBackoff: number; maxBackoff: number },
): Promise<Buffer> {
  const rangeHeader = `bytes=${offset}-${offset + length - 1}`;
  let attempt = 0;
  let backoff = options.initialBackoff;
  while (true) {
    try {
      console.log(`Fetching range ${rangeHeader} from ${url} (attempt ${attempt})...`);
      const response = await axios.get(url, {
        headers: { Range: rangeHeader },
        responseType: "arraybuffer",
        timeout: options.timeout,
      });
      return zlib.gunzipSync(Buffer.from(response.data));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error fetching range ${rangeHeader} from ${url} (${errorMessage}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, options.maxBackoff);
      attempt++;
    }
  }
}
