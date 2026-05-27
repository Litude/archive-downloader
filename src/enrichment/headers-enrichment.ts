import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JSON5 from "json5";
import { RawHeader } from "../headers/raw-header-parser.js";
import { CaptureEntry } from "../types/capture-types.js";
import { parseArcHeader } from "../archive-record/arc-header.js";
import { parseWarcinfoFile } from "../archive-record/warc-info.js";
import { getHeaderValue } from "../headers/headers.js";
import { deriveRefererFromMicrosoftTrackingImage } from "./header-derivation/microsoft-tracking-image.js";
import { lookupAlexaOverride } from "./alexa-overrides.js";
import { parseRecordFormatFromArchiveFilename } from "../archive-record/filename/record-filename-common.js";
import { lookupPrincipalHeaders } from "./principal-overrides.js";

interface HeaderPeriod {
  from: string;
  to: string;
  protocol?: string;
  headers: string[][];
}

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/enrichment");

const PROVIDER_FILES: Record<string, string> = {
  alexa: "headers_alexa.json",
  commoncrawl: "headers_commoncrawl.json",
  compaqsrc: "headers_compaqsrc.json",
  accelovation: "headers_accelovation.json",
  "portuguese-web-archive": "headers_portuguese-web-archive.json",
};

const cache = new Map<string, HeaderPeriod[]>();

function loadHeaderData(provider: string): HeaderPeriod[] {
  if (cache.has(provider)) {
    return cache.get(provider)!;
  }
  const filename = PROVIDER_FILES[provider];
  if (!filename) {
    return [];
  }
  const data = JSON5.parse<HeaderPeriod[]>(fs.readFileSync(path.join(dataDir, filename), "utf-8"));
  cache.set(provider, data);
  return data;
}

function setOrReplaceHeader(headers: RawHeader[], name: string, value: string): void {
  const nameLower = name.toLowerCase();
  const idx = headers.findIndex((h) => h[0].toLowerCase() === nameLower);
  if (idx >= 0) {
    headers[idx] = [name, value];
  } else {
    headers.push([name, value]);
  }
}

function buildDerivedHeaders(
  headerDefs: string[][],
  hostValue: string | undefined,
  refererValue: string | undefined,
): RawHeader[] {
  const result: RawHeader[] = [];
  for (const header of headerDefs) {
    const name = header[0];
    const value = header[1];
    const token = header[2]; // optional token indicating that the value is not certain and may need to be overridden by a value from the capture (e.g. from the Host header or a Referer header that looks like a Microsoft tracking image)
    if (value !== undefined) {
      result.push(token === "?" ? [name, value, token] : [name, value]);
    } else if (name.toLowerCase() === "host" && hostValue) {
      result.push([name, hostValue]);
    } else if (name.toLowerCase() === "referer" && refererValue) {
      result.push([name, refererValue]);
    }
    // length-1 entries with no special handling → omit
  }
  return result;
}

export function enrichWithRequestHeaders(captureEntry: CaptureEntry): void {

  const archiveFilename = captureEntry.cdxEntry.filename;
  const recordFormat = archiveFilename ? parseRecordFormatFromArchiveFilename(archiveFilename) : undefined;
  if (recordFormat === "warc") {
    // WARC files include full request headers, no need for deducing these
    return;
  }

  const provider = captureEntry.metadata?.archiveFileInfo?.crawlProvider;

  let headers: RawHeader[] | undefined;
  let usedOverride = false;

  if (provider === "alexa" && captureEntry.metadata?.archiveFileInfo?.crawlerName) {
    const overrideEntries = lookupAlexaOverride(
      captureEntry.metadata.archiveFileInfo.crawlerName,
      captureEntry.timestamp,
    );
    if (overrideEntries !== undefined) {
      usedOverride = true;
      const headerEntry = overrideEntries.find((e) => e.headers);
      const protocol = overrideEntries.find((e) => e.protocol)?.protocol ?? headerEntry?.protocol;
      if (protocol) {
        if (!captureEntry.metadata) {
          captureEntry.metadata = {};
        }
        captureEntry.metadata.derivedRequestProtocol = protocol;
      }
      if (headerEntry?.headers) {
        const refererValue = deriveRefererFromMicrosoftTrackingImage(captureEntry)?.[0]?.[1];
        let hostValue: string | undefined;
        try {
          // ia_archiver (Alexa) never included non-standard port numbers in the Host header
          hostValue = new URL(captureEntry.url).hostname;
        } catch {
          // ignore malformed URLs
        }
        const result = buildDerivedHeaders(headerEntry.headers, hostValue, refererValue);
        if (result.length > 0) {
          headers = result;
        }
      }
    }
  }

  if (provider === "internet-archive") {
    const crawlIdentifier = captureEntry.metadata?.archiveFileInfo?.crawlIdentifier;
    const headerEntry = crawlIdentifier ? lookupPrincipalHeaders(crawlIdentifier, captureEntry.timestamp) : undefined;
    if (headerEntry) {
      usedOverride = true;
      if (headerEntry.protocol) {
        if (!captureEntry.metadata) {
          captureEntry.metadata = {};
        }
        captureEntry.metadata.derivedRequestProtocol = headerEntry.protocol;
      }
      const refererValue = deriveRefererFromMicrosoftTrackingImage(captureEntry)?.[0]?.[1];
      let hostValue: string | undefined;
      try {
        const parsed = new URL(captureEntry.url);
        // ia_archiver (Alexa) never included non-standard port numbers in the Host header
        hostValue = parsed.host;
      } catch {
        // ignore malformed URLs
      }
      const result = buildDerivedHeaders(headerEntry.headers, hostValue, refererValue);
      if (result.length > 0) {
        headers = result;
      }
    }
  }

  if (!usedOverride && provider && provider in PROVIDER_FILES) {
    const periods = loadHeaderData(provider);
    const period = periods.find(
      (p) => captureEntry.timestamp >= p.from && captureEntry.timestamp <= p.to,
    );

    if (period) {
      if (period.protocol) {
        if (!captureEntry.metadata) {
          captureEntry.metadata = {};
        }
        captureEntry.metadata.derivedRequestProtocol = period.protocol;
      }
      const refererValue = deriveRefererFromMicrosoftTrackingImage(captureEntry)?.[0]?.[1];
      let hostValue: string | undefined;
      try {
        const parsed = new URL(captureEntry.url);
        // ia_archiver (Alexa) never included non-standard port numbers in the Host header
        hostValue = provider === "alexa" ? parsed.hostname : parsed.host;
      } catch {
        // ignore malformed URLs
      }
      const result = buildDerivedHeaders(period.headers, hostValue, refererValue);
      if (result.length > 0) {
        headers = result;
      }
    }
  }

  // User-Agent and From from ARC header or WARC-INFO override the JSON-derived values
  const arcHeaderRecord = captureEntry.records?.find((r) => r.type === "arc-header");
  const warcInfoRecord = captureEntry.records?.find((r) => r.type === "warc-info");

  let arcUserAgent: string | undefined;
  let arcFrom: string | undefined;

  if (arcHeaderRecord) {
    const parsed = parseArcHeader(arcHeaderRecord.content);
    arcUserAgent = getHeaderValue(parsed, "http-header-user-agent");
    arcFrom = getHeaderValue(parsed, "http-header-from");
  } else if (warcInfoRecord) {
    const parsed = parseWarcinfoFile(warcInfoRecord.content);
    arcUserAgent = getHeaderValue(parsed.lines, "http-header-user-agent");
    arcFrom = getHeaderValue(parsed.lines, "http-header-from");
  }

  if (arcUserAgent || arcFrom) {
    if (!headers) {
      headers = [];
    }
    if (arcUserAgent) {
      setOrReplaceHeader(headers, "User-Agent", arcUserAgent);
    }
    if (arcFrom) {
      setOrReplaceHeader(headers, "From", arcFrom);
    }
  }

  if (headers && headers.length > 0) {
    if (!captureEntry.metadata) {
      captureEntry.metadata = {};
    }
    captureEntry.metadata.derivedRequestHeaders = headers;
  }
}
