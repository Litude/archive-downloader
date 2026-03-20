import { CaptureEntry } from "../../../types/capture-types";
import { fetchNlaCdxIndex } from "./nla-archive";

export async function tryToCompleteMissingCdxFields(captureEntries: CaptureEntry[]) {
  for (const entry of captureEntries) {
    if (entry.cdxEntry.offset === undefined) {
      const isNlaCrawl = entry.metadata?.wayback?.item.collections.some(coll => coll.id === 'nlaweb');
      if (isNlaCrawl) {
        try {
          const cdxEntries = await fetchNlaCdxIndex(entry.url, { from: entry.timestamp, to: entry.timestamp });
          if (cdxEntries.length > 0) {
            const matchedEntry = cdxEntries.find(cdx => cdx.timestamp === entry.timestamp && cdx.url === entry.url && cdx.digest === entry.cdxEntry.digest && cdx.length === entry.cdxEntry.length);
            if (matchedEntry) {
              entry.cdxEntry.offset = matchedEntry.offset;
            }
          }
          else {
            console.error(`No NLA CDX entries found for ${entry.url} at ${entry.timestamp}`);
          }
        } catch (error) {
          console.error(`Error fetching CDX data for ${entry.url} at ${entry.timestamp}:`, error);
        }
      }
    }
  }
}
