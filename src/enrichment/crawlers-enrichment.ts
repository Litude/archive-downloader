import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSON5 from "json5";
import {
  ParsedRecordFilename,
  crawlOrdering,
} from "../archive-record/filename/record-filename-common.js";
import { lookupAlexaOverride } from "./alexa-overrides.js";

export interface KnownCrawlerEntry {
  crawlerName?: string;
  crawlerHostname?: string;
  crawlerHostnameSecondary?: string;
  crawlerIpAddress?: string;
}

export interface CrawlerEnrichment {
  crawlerHostnameSecondary?: string;
  knownCrawlers?: KnownCrawlerEntry[];
  crawlerIpRange?: string;
  fileSize?: number;
  fileMd5?: string;
  fileModificationTime?: string;
}

export type ArchiveFileInfo = Partial<ParsedRecordFilename> & CrawlerEnrichment;

const archiveFileInfoOrdering: Record<string, number> = {
  ...(crawlOrdering as Record<string, number>),
  crawlerHostnameSecondary: 41.5,
  knownCrawlers: 48,
  crawlerIpRange: 49,
  fileSize: 90,
  fileModificationTime: 91,
  fileMd5: 92,
};

export function sortArchiveFileInfo(info: ArchiveFileInfo): ArchiveFileInfo {
  return Object.fromEntries(
    Object.entries(info).sort(
      ([a], [b]) => (archiveFileInfoOrdering[a] ?? 999) - (archiveFileInfoOrdering[b] ?? 999),
    ),
  ) as ArchiveFileInfo;
}

export function buildArchiveFileInfo(
  details: ParsedRecordFilename,
  captureTimestamp: string,
): ArchiveFileInfo {
  const enrichment = enrichWithCrawlerData(details, captureTimestamp);
  return sortArchiveFileInfo({ ...enrichment, ...details });
}

interface CrawlerPeriod {
  from: string;
  to: string;
  knownCrawlers?: KnownCrawlerEntry[];
  crawlerIpRange?: string;
}

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/enrichment");

const PROVIDER_FILES: Record<string, string> = {
  alexa: "crawlers_alexa.json",
  commoncrawl: "crawlers_commoncrawl.json",
  compaqsrc: "crawlers_compaqsrc.json",
  accelovation: "crawlers_accelovation.json",
};

const cache = new Map<string, CrawlerPeriod[]>();

function loadCrawlerData(provider: string): CrawlerPeriod[] {
  if (cache.has(provider)) {
    return cache.get(provider)!;
  }
  const filename = PROVIDER_FILES[provider];
  if (!filename) {
    return [];
  }
  const data = JSON5.parse<CrawlerPeriod[]>(fs.readFileSync(path.join(dataDir, filename), "utf-8"));
  cache.set(provider, data);
  return data;
}

function normalizeHostname(hostname: string): string {
  return hostname.split(":")[0].toLowerCase();
}

export function enrichWithCrawlerData(
  archiveFileInfo: ParsedRecordFilename,
  captureTimestamp: string,
): Partial<ArchiveFileInfo> {
  const provider = archiveFileInfo.crawlProvider;
  if (!provider || !(provider in PROVIDER_FILES)) {
    return {};
  }

  if (provider === "alexa" && archiveFileInfo.crawlerName) {
    const overrideEntries = lookupAlexaOverride(archiveFileInfo.crawlerName, captureTimestamp);
    if (overrideEntries !== undefined) {
      const entry = overrideEntries.find((e) => e.crawlerHostname || e.crawlerIpAddress);
      if (!entry) {
        return {};
      }
      const result: Partial<ArchiveFileInfo> = {};
      if (entry.crawlerHostname !== undefined) {
        result.crawlerHostname = entry.crawlerHostname;
      }
      if (entry.crawlerIpAddress !== undefined) {
        result.crawlerIpAddress = entry.crawlerIpAddress;
      }
      return result;
    }
  }

  const periods = loadCrawlerData(provider);
  const period = periods.find((p) => captureTimestamp >= p.from && captureTimestamp <= p.to);
  if (!period) {
    return {};
  }

  if (period.crawlerIpRange) {
    return { crawlerIpRange: period.crawlerIpRange };
  }

  const knownCrawlers = period.knownCrawlers;
  if (!knownCrawlers || knownCrawlers.length === 0) {
    return {};
  }

  const crawlerName = archiveFileInfo.crawlerName?.toLowerCase();
  const crawlerHostname = archiveFileInfo.crawlerHostname
    ? normalizeHostname(archiveFileInfo.crawlerHostname)
    : undefined;

  if (crawlerName || crawlerHostname) {
    const match = knownCrawlers.find(
      (c) =>
        (crawlerName && c.crawlerName?.toLowerCase() === crawlerName) ||
        (crawlerHostname &&
          c.crawlerHostname &&
          normalizeHostname(c.crawlerHostname) === crawlerHostname),
    );
    if (match) {
      const result: Partial<ArchiveFileInfo> = {};
      if (match.crawlerName !== undefined) {
        result.crawlerName = match.crawlerName;
      }
      if (match.crawlerHostname !== undefined) {
        result.crawlerHostname = match.crawlerHostname;
      }
      if (match.crawlerHostnameSecondary !== undefined) {
        result.crawlerHostnameSecondary = match.crawlerHostnameSecondary;
      }
      if (match.crawlerIpAddress !== undefined) {
        result.crawlerIpAddress = match.crawlerIpAddress;
      }
      return result;
    }
  }

  if (knownCrawlers.length <= 5) {
    return { knownCrawlers };
  }

  return {};
}
