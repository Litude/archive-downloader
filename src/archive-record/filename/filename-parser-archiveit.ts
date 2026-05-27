import { DateTime } from "luxon";
import {
  cleanUpRecordFilenameResult,
  findRecordNameTimestampPartIndex,
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";
import { parseGenericRecordFilenamePickBest } from "./filename-parser-generic.js";

/**
 * 
ARCHIVEIT-316-LFDEMO-ARCHIVING-20060601201822-00061-crawling024.archive.org.arc.gz
ARCHIVEIT-5810-CDL-20071030104913-00013-voulkos.arc.gz
ARCHIVEIT-5810-CDL-20071031202224-00010-voulkos.arc.gz
ARCHIVEIT-933-SINGAPORE-SINGAPORE-20080422020121-00769-crawling13.us.archive.org.arc.gz
ARCHIVEIT-8238-EXTERNAL-20180223180000-SEED_ID-571-23767904.arc.gz
ARCHIVEIT-3660-WEEKLY-29857-20130816160810609-00009-wbgrp-crawl101.us.archive.org-6440.warc.gz
ARCHIVEIT-3669-WEEKLY-9439-20130819210907161-00002-wbgrp-crawl102.us.archive.org-6440.warc.gz
ARCHIVEIT-10456-EXTERNAL-20201223000000-LACBAC-CANADA-FEDERAL-ELECTION-2008-20081023070545-00007-dclnx02.lac-bac.gc.ca.arc.gz
ARCHIVEIT-6349-CDL-20090304193606-00000-oriole.ucop.edu-00075620.arc.gz
ARCHIVEIT-1372-20090416005454-00026-crawling10.us.archive.org.warc.gz
ARCHIVEIT-969-ANNUAL-ATKZUI-20100731005822-00010-crawling10.us.archive.org-6680.warc.gz
ARCHIVEIT-2323-WEEKLY-YGXNSG-20110201001216-00213-crawling109.us.archive.org-6683.warc.gz
 * 
 */

function isRegularArchiveItFilename(filename: string): boolean {
  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  return (
    baseName.startsWith("ARCHIVEIT-") &&
    !baseName.match(/^ARCHIVEIT-\d+-EXTERNAL-/) &&
    !baseName.match(/^ARCHIVEIT-\d+-CDL-/) &&
    !baseName.match(/^ARCHIVEIT-\d+-WAYBACKFILL-/) &&
    !baseName.match(/^ARCHIVEIT-\d+-EXTRACTION-/)
  );
}

function parseArchiveItCdlFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-5810-CDL-20071030104913-00013-voulkos.arc.gz
  // ARCHIVEIT-6053-CDL-20150627015026-00020-cdl-wascraw-p03.ucop.edu-00580195.arc.gz

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = baseName.split("-");

  const identifier = parts.shift();
  if (identifier !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const cdlPart = parts.shift();
  if (cdlPart !== "CDL") {
    return undefined;
  }
  const timestampPart = parts.shift();
  const timestamp = DateTime.fromFormat(timestampPart ?? "", "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!timestamp.isValid) {
    return undefined;
  }
  const serialNumber = parts.shift();
  if (!serialNumber?.match(/^\d+$/)) {
    return undefined;
  }
  const finalNumber = parts.pop() ?? "";
  if (!finalNumber.match(/^\d{8}$/)) {
    parts.push(finalNumber);
  }

  const crawlerName = parts.join("-");

  return {
    confidence: 1.0,
    filenameType: "archiveit-cdl",
    recordFormat,
    details: {
      crawlIdentifier: `${identifier}-${collectionId}-${cdlPart}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      fileSerialNumber: serialNumber,
      crawlerName,
      crawlProvider: "cdl",
    },
  };
}

function parseArchiveItExternalFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-8238-EXTERNAL-20180223180000-SEED_ID-571-23767904.arc.gz
  // ARCHIVEIT-10456-EXTERNAL-20201223000000-LACBAC-CANADA-FEDERAL-ELECTION-2008-20081023070545-00007-dclnx02.lac-bac.gc.ca.arc.gz
  //
  // Hypothesis:
  // Archive-It preprends ARCHIVEIT-{collectionId}-EXTERNAL-{timestamp}- to the original filename

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  const parts = baseName.split("-");

  const identifier = parts.shift();
  if (identifier !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const externalPart = parts.shift();
  if (externalPart !== "EXTERNAL") {
    return undefined;
  }
  const timestampPart = parts.shift();
  const processingTimestamp = DateTime.fromFormat(timestampPart ?? "", "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!processingTimestamp.isValid) {
    return undefined;
  }
  const baseData = parseGenericRecordFilenamePickBest(
    `${parts.join("-")}.${recordFormat}.gz`,
    captureTimestamp,
  );

  return {
    confidence: 1.0,
    filenameType: "archiveit-external",
    recordFormat,
    details: {
      ...baseData?.details,
      crawlIdentifier: `${identifier}-${collectionId}-${externalPart}`,
      crawlOriginalIdentifier: baseData?.details.crawlIdentifier,
      crawlCollectionId: collectionId,
      crawlProcessingTimestamp: processingTimestamp.toISO({ suppressMilliseconds: true }),
    },
  };
}

export function parseArchiveItBrozzlerFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-8043-TEST-JOB472646-SEED1439120-20171026205212466-00000-zgwr0ovc.warc.gz
  // ARCHIVEIT-21967-WEEKLY-JOB2636914-0-SEED3167526-20251203202132377-00000-jw97nufh.warc.gz
  // ARCHIVEIT-21967-WEEKLY-JOB2579594-0-SEED3167524-20250717171257364-00006-qnszbgpk.warc.gz
  // ARCHIVEIT-21967-DAILY-JOB1887448-0-SEED3167529-20231102170916439-00000-5rpaom9s.warc.gz

  // Date range:
  // Minimum timestamp: 20170101000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp ? captureTimestamp >= "20170101000000" : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 8) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const recurrence = parts.shift();
  const jobId = parts.shift();
  if (!jobId?.match(/^JOB\d+$/)) {
    return undefined;
  }

  // Optional separator digit
  const separatorDigit = parts.shift();
  if (separatorDigit?.match(/^SEED\d+$/)) {
    parts.unshift(separatorDigit);
  }

  const seedId = parts.shift();
  if (!seedId?.match(/^SEED\d+$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 17) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmssSSS", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2017) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }

  const crawlToken = parts.pop() ?? "";
  if (crawlToken.length !== 8) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-brozzler",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${recurrence}-${jobId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO(),
      fileSerialNumber: serialNumber,
      crawlInterval: recurrence,
      crawlToken,
      crawlProvider: "internet-archive",
      crawlSeedId: seedId,
      crawlJobId: jobId,
    },
  };
}

export function parseArchiveIt2006Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-316-LFDEMO-ARCHIVING-20060601201822-00061-crawling024.archive.org.arc.gz
  // ARCHIVEIT-933-SINGAPORE-SINGAPORE-20080422020121-00769-crawling13.us.archive.org.arc.gz

  // Date range:
  // Minimum timestamp: 20060101000000
  // Maximum timestamp: 20090315000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp
    ? captureTimestamp >= "20060101000000" && captureTimestamp <= "20090315000000"
    : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 6) {
    return undefined;
  }

  // Both the collection identifier and the hostname could include dashes, so we lookup the timestamp first
  const timestampIndex = findRecordNameTimestampPartIndex(parts, {
    allow8Digits: false,
    allow14Digits: true,
    allow17Digits: false,
  });
  if (timestampIndex === -1 || timestampIndex < 1) {
    return undefined;
  }
  const timestampPart = parts[timestampIndex];
  if (timestampPart.length !== 14) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2006 || timestamp.year > 2009) {
    return undefined;
  }

  const preTimestampParts = parts.slice(0, timestampIndex);
  const postTimestampParts = parts.slice(timestampIndex + 1);

  const serialNumber = postTimestampParts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }
  const crawlerName = postTimestampParts.join("-");

  const archiveItPrefix = preTimestampParts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = preTimestampParts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const identifierSuffix = preTimestampParts.join("-");

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2006",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${identifierSuffix}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      fileSerialNumber: serialNumber,
      crawlerName,
      crawlProvider: "internet-archive",
    },
  };
}

export function parseArchiveIt2009Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-1372-20090315035757-00064-crawling01.us.archive.org.arc.gz
  // ARCHIVEIT-1372-20090416005454-00026-crawling10.us.archive.org.warc.gz

  // Date range:
  // Minimum timestamp: 20090315000000
  // Maximum timestamp: 20100101000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp
    ? captureTimestamp >= "20090315000000" && captureTimestamp < "20100101000000"
    : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  const parts = baseName.split("-");
  if (parts.length < 5) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 14) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2009 || timestamp.year > 2009) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }
  const crawlerName = parts.join("-");

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2009",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      fileSerialNumber: serialNumber,
      crawlerName,
      crawlProvider: "internet-archive",
    },
  };
}

export function parseArchiveIt2010Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-1784-DAILY-AZBTUZ-20100124235330-00692-crawling10.us.archive.org-8093.warc.gz
  // ARCHIVEIT-969-ANNUAL-ATKZUI-20100730042117-00001-crawling10.us.archive.org-6680.warc.gz
  // ARCHIVEIT-2017-DAILY-JCDPMN-20101215131710-00251-crawling06.us.archive.org-6682.warc.gz

  // Date range:
  // Minimum timestamp: 20100101000000
  // Maximum timestamp: 20140101000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp
    ? captureTimestamp >= "20100101000000" && captureTimestamp < "20140101000000"
    : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 7) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const recurrence = parts.shift();
  const jobId = parts.shift();
  if (!jobId?.match(/^[A-Z]{6}$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 14) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2010 || timestamp.year > 2013) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }
  const crawlerPort = parts.pop() ?? "";
  const crawlerHost = parts.join("-");
  const crawlerName = `${crawlerHost}:${crawlerPort}`;

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2010",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${recurrence}-${jobId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO({ suppressMilliseconds: true }),
      fileSerialNumber: serialNumber,
      crawlerName,
      crawlInterval: recurrence,
      crawlProvider: "internet-archive",
      crawlJobId: jobId,
    },
  };
}

export function parseArchiveIt2013Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-3470-QUARTERLY-6778-20130322105706466-00198-wbgrp-crawl105.us.archive.org-6444.warc.gz
  // ARCHIVEIT-3536-WEEKLY-28906-20130519235944750-00018-wbgrp-crawl061.us.archive.org-6441.warc.gz
  // ARCHIVEIT-3536-DAILY-29401-20130926230609393-00126-wbgrp-crawl060.us.archive.org-6442.warc.gz

  // Date range:
  // Minimum timestamp: 20130101000000
  // Maximum timestamp: 20160101000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp
    ? captureTimestamp >= "20130101000000" && captureTimestamp < "20160101000000"
    : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 7) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const recurrence = parts.shift();
  const jobId = parts.shift();
  if (!jobId?.match(/^\d+$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 17) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmssSSS", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2013 || timestamp.year > 2015) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }
  const crawlerPort = parts.pop() ?? "";
  const crawlerHost = parts.join("-");
  const crawlerName = `${crawlerHost}:${crawlerPort}`;

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2013",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${recurrence}-${jobId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO(),
      fileSerialNumber: serialNumber,
      crawlerName,
      crawlInterval: recurrence,
      crawlProvider: "internet-archive",
      crawlJobId: jobId,
    },
  };
}

export function parseArchiveIt2015Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-4639-TEST-JOB163233-20150706094810990-00102.warc.gz
  // ARCHIVEIT-3876-SEMIANNUAL-JOB172211-20150909210737792-00004.warc.gz
  // ARCHIVEIT-6509-ONE_TIME-JOB183502-20151116230851201-00047.warc.gz

  // Date range:
  // Minimum timestamp: 20150301000000
  // Maximum timestamp: 20180903000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp
    ? captureTimestamp >= "20150201000000" && captureTimestamp < "20181001000000"
    : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 5) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const recurrence = parts.shift();
  const jobId = parts.shift();
  if (!jobId?.match(/^JOB\d+$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 17) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmssSSS", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2015 || timestamp.year > 2018) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2015",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${recurrence}-${jobId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO(),
      fileSerialNumber: serialNumber,
      crawlInterval: recurrence,
      crawlProvider: "internet-archive",
      crawlJobId: jobId,
    },
  };
}

export function parseArchiveIt2018Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // ARCHIVEIT-12734-DAILY-JOB1039423-SEED2057296-20191128193159008-00000-h3.warc.gz
  // ARCHIVEIT-12737-DAILY-JOB1038450-SEED2060782-20191126022650960-00000-h3.warc.gz

  // Date range:
  // Minimum timestamp: 20180901000000
  if (!isRegularArchiveItFilename(filename)) {
    return undefined;
  }

  const timestampMatch = captureTimestamp ? captureTimestamp >= "20180901000000" : false;

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }
  const parts = baseName.split("-");
  if (parts.length < 5) {
    return undefined;
  }

  const archiveItPrefix = parts.shift();
  if (archiveItPrefix !== "ARCHIVEIT") {
    return undefined;
  }
  const collectionId = parts.shift();
  if (!collectionId || !collectionId.match(/^\d+$/)) {
    return undefined;
  }
  const recurrence = parts.shift();
  const jobId = parts.shift();
  if (!jobId?.match(/^JOB\d+$/)) {
    return undefined;
  }
  const seedId = parts.shift();
  if (!seedId?.match(/^SEED\d+$/)) {
    return undefined;
  }
  const timestampPart = parts.shift() ?? "";
  if (timestampPart.length !== 17) {
    return undefined;
  }
  const timestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmssSSS", {
    zone: "UTC",
  });
  if (!timestamp.isValid || timestamp.year < 2018) {
    return undefined;
  }

  const serialNumber = parts.shift() ?? "";
  if (!serialNumber.match(/^\d+$/)) {
    return undefined;
  }

  const finalPart = parts.pop() ?? "";
  if (finalPart !== "h3") {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence = 1.0;
  }

  return {
    confidence,
    filenameType: "archiveit-2018",
    recordFormat,
    details: {
      crawlIdentifier: `${archiveItPrefix}-${collectionId}-${recurrence}-${jobId}`,
      crawlCollectionId: collectionId,
      fileWriteStartTimestamp: timestamp.toISO(),
      fileSerialNumber: serialNumber,
      crawlInterval: recurrence,
      crawlProvider: "internet-archive",
      crawlSeedId: seedId,
      crawlJobId: jobId,
    },
  };
}

export function parseArchiveItRecordFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [
    parseArchiveItCdlFilename,
    parseArchiveItExternalFilename,
    parseArchiveItBrozzlerFilename,
    parseArchiveIt2006Filename,
    parseArchiveIt2009Filename,
    parseArchiveIt2010Filename,
    parseArchiveIt2013Filename,
    parseArchiveIt2015Filename,
    parseArchiveIt2018Filename,
  ];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const result = parser(filename, _captureTimestamp);
    if (result) {
      results.push(result);
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results.map(cleanUpRecordFilenameResult);
}
