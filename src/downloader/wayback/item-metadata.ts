import axios, { AxiosResponse } from "axios";
import { WaybackItemDetails, WaybackMetadata } from "./wayback-types.js";
import {
  WAYBACK_INITIAL_BACKOFF,
  WAYBACK_MAX_BACKOFF,
  WAYBACK_REQUEST_TIMEOUT,
} from "./wayback-common.js";

const WAYBACK_METADATA_API_URL = "archive.org/metadata/";

function createMetadataUrl(itemId: string, attempt: number): string {
  const protocol = (attempt || 0) % 2 === 0 ? "http" : "https";
  return `${protocol}://${WAYBACK_METADATA_API_URL}/${itemId}`;
}

const metadataCache: Record<string, WaybackMetadata> = {};

export async function getWaybackItemMetadata(itemId: string): Promise<WaybackMetadata> {
  if (metadataCache[itemId]) {
    return metadataCache[itemId];
  }
  const metadata = await fetchWaybackItemMetadata(itemId);
  metadataCache[itemId] = metadata;
  return metadata;
}

async function fetchWaybackItemMetadata(itemId: string): Promise<WaybackMetadata> {
  let attempt = 1;
  let backoff = WAYBACK_INITIAL_BACKOFF;
  while (true) {
    try {
      console.log(`Fetching metadata for item ${itemId} (attempt ${attempt})...`);
      const url = createMetadataUrl(itemId, attempt - 1);
      const response: AxiosResponse<WaybackItemDetails> = await axios.get(url, {
        timeout: WAYBACK_REQUEST_TIMEOUT,
      });
      const data = response.data;
      const numWarcs = data.files
        ? data.files.filter((file) => file.name.endsWith(".warc.gz")).length
        : 0;
      const numArcs = data.files
        ? data.files.filter((file) => file.name.endsWith(".arc.gz")).length
        : 0;
      if (numWarcs && !data.metadata.numwarcs) {
        data.metadata.numwarcs = numWarcs.toString();
      }
      if (numArcs && !data.metadata.numarcs) {
        data.metadata.numarcs = numArcs.toString();
      }
      return data.metadata;
    } catch (e) {
      console.log(
        `Error fetching metadata for item ${itemId}: ${e}, retrying in ${backoff / 1000}s...`,
      );
      await new Promise((res) => setTimeout(res, backoff));
      backoff = Math.min(backoff * 2, WAYBACK_MAX_BACKOFF);
      attempt++;
    }
  }
}
