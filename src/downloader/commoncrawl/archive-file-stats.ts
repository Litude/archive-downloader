import axios from "axios";
import { DateTime } from "luxon";
import {
  COMMONCRAWL_DOWNLOAD_BASE,
  COMMONCRAWL_INITIAL_BACKOFF,
  COMMONCRAWL_MAX_BACKOFF,
  COMMONCRAWL_REQUEST_TIMEOUT,
} from "./commoncrawl-common.js";

export interface CommonCrawlArchiveFileStats {
  size?: number;
  md5?: string;
  mtime?: string;
}

const cache = new Map<string, CommonCrawlArchiveFileStats>();

export async function fetchCommonCrawlArchiveFileStats(
  filename: string,
): Promise<CommonCrawlArchiveFileStats> {
  const cached = cache.get(filename);
  if (cached) {
    return cached;
  }
  const url = `${COMMONCRAWL_DOWNLOAD_BASE}${filename}`;
  let backoff = COMMONCRAWL_INITIAL_BACKOFF;
  while (true) {
    try {
      const response = await axios.head(url, { timeout: COMMONCRAWL_REQUEST_TIMEOUT });
      const contentLength = response.headers["content-length"];
      const size = contentLength ? parseInt(contentLength, 10) : undefined;
      const rawEtag = response.headers["etag"];
      const etag = rawEtag ? rawEtag.replace(/^"|"$/g, "") : undefined;
      const md5 = etag && /^[a-f0-9]{32}$/i.test(etag) ? etag.toLowerCase() : undefined;
      const lastModified = response.headers["last-modified"];
      const mtime = lastModified
        ? (DateTime.fromHTTP(lastModified).toUTC().toISO({ suppressMilliseconds: true }) ??
          undefined)
        : undefined;
      const stats: CommonCrawlArchiveFileStats = { size, md5, mtime };
      cache.set(filename, stats);
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Error fetching Common Crawl archive file stats for ${filename} (${message}), retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, COMMONCRAWL_MAX_BACKOFF);
    }
  }
}
