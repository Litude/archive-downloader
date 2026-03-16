import axios, { AxiosResponse } from "axios";
import { CdxEntry } from "../types/wayback-types";

const COLLECTIONS_API_URL = 'web.archive.org/__wb/calendarcaptures/2';

const INITIAL_BACKOFF = 30_000; // 30 seconds
const MAX_BACKOFF = 600_000; // 10 minutes

interface WaybackCollectionResponse {
    colls: string[][];
    items: [number, number, number][]; // 1. MMDDHHMMSS (as a number, so must be zero padded!), 2. status code, 3. cols index
}

export interface CollectionInfo {
    timestamp: string;
    status: string;
    collections: string[];
}

async function fetchCollectionsForYear(url: string, year: string): Promise<WaybackCollectionResponse> {
    let attempt = 1;
    let backoff = INITIAL_BACKOFF;
    while (true) {
        const protocol = (attempt || 0) % 2 === 0 ? 'http' : 'https';
        try {
            const { data }: AxiosResponse<WaybackCollectionResponse> = await axios.get(`${protocol}://${COLLECTIONS_API_URL}`, {
                params: {
                    url,
                    date: year
                }
            });
            return data;
        } catch (error) {
            console.error(`Error fetching collections for year ${year}:`, error);
            console.log(`Retrying in ${backoff / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            backoff = Math.min(backoff * 2, MAX_BACKOFF);
            attempt++;
        }
    }
}

// Collections that don't provide any info on the original crawler
const UNNECESSARY_COLLECTIONS = ["20thcenturyweb"];

function removeUnnecessaryCollections(input: CollectionInfo[]): CollectionInfo[] {
    return input.map(info => {
        const filteredCollections = info.collections.filter(coll => !UNNECESSARY_COLLECTIONS.includes(coll));
        return {
            ...info,
            // If all collections were filtered out, keep the original list to avoid losing potentially useful info
            collections: filteredCollections.length > 0 ? filteredCollections : info.collections
        }
    }).filter(info => info.collections.length > 0);
}

export async function getWaybackCollections(captures: CdxEntry[], url: string) {
    if (!captures || captures.length === 0) {
        return [];
    }
    const years = new Set(captures.map(capture => capture.timestamp.substring(0, 4)));
    const startYear = Math.min(...Array.from(years).map(year => parseInt(year)));
    const endYear = Math.max(...Array.from(years).map(year => parseInt(year)));

    let results: CollectionInfo[] = [];

    for (let i = startYear; i <= endYear; i++) {
        console.log(`Fetching collections for year ${i}...`);
        const year = i.toString();
        const response = await fetchCollectionsForYear(url, year);
        const collectionsForYear = response.items.map((coll) => {
            const [timestampNum, statusCode, collIndex] = coll;
            const timestampStr = `${year}${timestampNum.toString().padStart(10, '0')}`;
            const collections = response.colls[collIndex];
            return { timestamp: timestampStr, status: statusCode.toString(), collections };
        });
        results = [...results, ...collectionsForYear];
    }
    return removeUnnecessaryCollections(results);
}
