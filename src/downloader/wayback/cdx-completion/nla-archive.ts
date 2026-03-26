import axios, { AxiosResponse } from "axios";
import { WAYBACK_INITIAL_BACKOFF, WAYBACK_REQUEST_TIMEOUT } from "../wayback-common.js";
import { CdxEntry } from "../../../types/wayback-types.js";
import { cdxStringToNumber } from "../../../cdx/cdx-utils.js";

const NLA_CDX_URL = "https://web.archive.org.au/awa/cdx";

interface NlaRawCdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  status: string;
  digest: string;
  redirect: string;
  robotflags: string;
  length: string;
  offset: string;
  filename: string;
  load_url: string;
  source: string;
  "source-coll": string;
}

export async function fetchNlaCdxIndex(
  url: string,
  options?: { from?: string; to?: string },
): Promise<CdxEntry[]> {
  const attempt = 1;
  let backoff = WAYBACK_INITIAL_BACKOFF;

  while (true) {
    try {
      const params = {
        url,
        output: "json",
        from: options?.from,
        to: options?.to,
      };
      // The api returns text/x-ndjson
      console.log(`Fetching NLA CDX index for ${url}`);
      const response: AxiosResponse<string> = await axios.get(NLA_CDX_URL, {
        params,
        timeout: WAYBACK_REQUEST_TIMEOUT,
        responseType: "text",
      });
      const rawEntries = response.data
        .split("\n")
        .map((line: string) => {
          const trimmed = line.trim();
          return trimmed ? JSON.parse(trimmed) : null;
        })
        .filter((entry: NlaRawCdxEntry | null): entry is NlaRawCdxEntry => entry !== null);
      return rawEntries.map((entry) => ({
        urlkey: entry.urlkey,
        timestamp: entry.timestamp,
        url: entry.url,
        mimetype: entry.mime,
        status: cdxStringToNumber(entry.status),
        digest: entry.digest,
        length: cdxStringToNumber(entry.length),
        offset: cdxStringToNumber(entry.offset),
        filename: entry.filename,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching CDX index (attempt ${attempt}):`, errorMessage);
      if (attempt < 5) {
        console.log(`Retrying in ${backoff} ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, WAYBACK_REQUEST_TIMEOUT); // Exponential backoff
      } else {
        throw new Error(
          `Failed to fetch NLA CDX index after ${attempt} attempts: ${errorMessage}`,
          { cause: error },
        );
      }
    }
  }
}
