/**
 * 
// Look for wb part, trim it away and what remains is the same in old and new names (i.e. crawler name)?
wb_robots.20030212074248.arc.gz
wb_robots.cgi4.20030924105819.arc.gz
wb_robots.cgi5.20030930151314.arc.gz
wb_robots.cgi7.20040217234219.arc.gz
wb_robots.ia11030.20040102053126.arc.gz
wb_robots.ia11022.20040107133145.arc.gz
wb_robots.m2352.20060320125737.arc.gz
wb_robots.ia331429.us.archive.org.20070611004850.arc.gz
wb_robots.ia311414.us.archive.org.20071016053011.arc.gz
wb_urls.20021006142449.arc.gz
wb_urls.ia11015.20040219044831.arc.gz
wb_urls.ia331419.us.archive.org.20070930201038.arc.gz
cgi2.archive.org.wb_robots.20021101062333.arc.gz
cgi5.archive.org.wb_urls.20021109025316.arc.gz
cgi3.archive.org.wb_urls.20021109211541.arc.gz
 * 
 */

import { DateTime } from "luxon";
import {
  cleanUpRecordFilenameResult,
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";

const WAYBACK_2002_TYPES = ["wb_robots", "wb_urls"];

function parseWayback2002Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // wb_urls.20020919151621.arc.gz
  // wb_robots.ia311414.us.archive.org.20071016053011.arc.gz
  // wb_urls.ia331419.us.archive.org.20070930201038.arc.gz
  // wb_robots.ia11030.20040102053126.arc.gz
  // cgi2.archive.org.wb_robots.20021101062333.arc.gz
  // wb_robots.cgi7.20040217234219.arc.gz

  // Date range:
  // Minimum: 20020919151621 (from cgi2.wb_robots.20021101062333-c)
  // Maximum: 20080107070600 (from wb_urls.ia331209.20071210113906-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20020901000000" &&
    captureTimestamp <= "20080201000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = baseName.split(".");
  if (parts.length < 2) {
    return undefined;
  }
  const rawTimestamp = parts.pop() ?? "";
  if (rawTimestamp.length !== 14) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(rawTimestamp, "yyyyMMddHHmmss", { zone: "UTC" });
  if (!timestamp.isValid) {
    return undefined;
  }
  const typeIndex = parts.findIndex((part) => WAYBACK_2002_TYPES.includes(part));
  if (typeIndex === -1) {
    return undefined;
  }
  const crawlIdentifier = parts[typeIndex];
  const crawlerName = [...parts.slice(0, typeIndex), ...parts.slice(typeIndex + 1)].join(".");

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }

  return {
    confidence,
    filenameType: "wayback-2002",
    recordFormat,
    details: {
      crawlIdentifier,
      crawlProvider: "internetarchive",
      // This seems to be slightly later than capture timestamp, so it must be when the arc was closed?
      fileWriteEndTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      crawlerName,
    },
  };
}

function parseWayback2012Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // WIDE-20110430162641-crawl426/WIDE-20110430162641-00020.warc.gz
  // SURV-20141018012849-crawl455/SURV-20141018013917-12026.warc.gz
  // SHAL-20130530153957-crawl455/SHAL-20130530155039-00123.warc.gz
  // NO404-WKP-20140609090717-crawl345/NO404-WKP-20140609202619-21601.warc.gz
  // WPO-20221001184503-crawl835/WPO-20221002230103-00086.warc.gz
  //
  // Date range:
  // Minimum: 20110101000000 (from )
  // Maximum: ??? (from )  might still be in use?
  //

  const timestampMatch = captureTimestamp && captureTimestamp >= "20110101000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 3) {
    return undefined;
  }
  const serialNumber = parts.pop();
  if (!serialNumber?.match(/^\d{5}$/)) {
    return undefined;
  }
  const timestampRaw = parts.pop();
  if (!timestampRaw || timestampRaw.length !== 14) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampRaw, "yyyyMMddHHmmss", { zone: "UTC" });
  if (!timestamp.isValid || timestamp.year < 2010) {
    return undefined;
  }
  const crawlIdentifier = parts.join("-");

  const collectionName = filename.split("/")[0];
  if (!collectionName.startsWith(crawlIdentifier)) {
    return undefined;
  }
  const [collectionTimestamp, crawlerName] = collectionName
    .slice(crawlIdentifier.length + 1)
    .split("-");
  if (!collectionTimestamp || collectionTimestamp.length !== 14) {
    return undefined;
  }
  const collectionTimestampParsed = DateTime.fromFormat(collectionTimestamp, "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!collectionTimestampParsed.isValid) {
    return undefined;
  }
  // We check that the crawler is not a serial number
  if (crawlerName.match(/^\d+$/)) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }

  return {
    confidence,
    filenameType: "wayback-2012",
    recordFormat,
    details: {
      crawlIdentifier,
      crawlProvider: "internetarchive",
      fileWriteStartTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      fileSerialNumber: serialNumber,
      crawlerName,
    },
  };
}

export function parseWaybackRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [parseWayback2002Filename, parseWayback2012Filename];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const parsed = parser(filename, captureTimestamp);
    if (parsed) {
      results.push(parsed);
    }
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  return results.map(cleanUpRecordFilenameResult);
}
