import axios from "axios";
import { parse as csvParse } from "csv-parse/sync";
import { sleep } from "../../utils/sleep.js";
const cachedCollectionSizes: Record<
  string,
  {
    numPages: number;
    numDigests: number;
    numUrls: number;
  }
> = {};

export async function getCommonCrawlCollectionSize(collectionId: string): Promise<{
  numPages: number;
  numDigests: number;
  numUrls: number;
}> {
  if (cachedCollectionSizes[collectionId] !== undefined) {
    return cachedCollectionSizes[collectionId];
  }

  while (true) {
    try {
      console.log(`Fetching collection sizes for common crawl...`);
      const response = await axios.get(
        `https://commoncrawl.github.io/cc-crawl-statistics/plots/crawlsize/monthly.csv`,
      );
      const content: string = response.data;

      const records = csvParse<{
        crawl: string;
        "digest estim.": string;
        page: string;
        url: string;
      }>(content, { columns: true });
      for (const record of records) {
        cachedCollectionSizes[record.crawl] = {
          numPages: parseInt(record.page, 10),
          numDigests: parseInt(record["digest estim."], 10),
          numUrls: parseInt(record.url, 10),
        };
      }
      return cachedCollectionSizes[collectionId];
    } catch (error) {
      console.error(
        `Error fetching collection size for ${collectionId}, retrying in 10 seconds...`,
        error,
      );
      await sleep(10000);
    }
  }
}
