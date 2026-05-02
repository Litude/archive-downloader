import { DateTime } from "luxon";
import {
  cleanUpRecordFilenameResult,
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";

/** Filename examples
 * crawl-001/2008/06/25/11/1214440586619_11.arc.gz (CC-MAIN-2008-2009)
 * crawl-002/2009/09/17/41/1253233750985_41.arc.gz (CC-MAIN-2009-2010)
 * parse-output/segment/1346876860817/1346950771477_128.arc.gz (CC-MAIN-2012)
 * crawl-data/CC-MAIN-2013-20/segments/1368696381249/warc/CC-MAIN-20130516092621-00072-ip-10-60-113-184.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2013-20/segments/1368710366143/warc/CC-MAIN-20130516131926-00072-ip-10-60-113-184.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2014-10/segments/1394011150121/warc/CC-MAIN-20140305091910-00094-ip-10-183-142-35.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2014-15/segments/1397609535095.7/warc/CC-MAIN-20140416005215-00140-ip-10-147-4-33.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2016-22/segments/1464053252010.41/warc/CC-MAIN-20160524012732-00178-ip-10-185-217-139.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2017-09/segments/1487501170613.8/crawldiagnostics/CC-MAIN-20170219104610-00516-ip-10-171-10-108.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2017-13/segments/1490218189466.30/warc/CC-MAIN-20170322212949-00259-ip-10-233-31-227.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2017-17/segments/1492917118477.15/warc/CC-MAIN-20170423031158-00135-ip-10-145-167-34.ec2.internal.warc.gz
 * crawl-data/CC-MAIN-2017-22/segments/1495463607963.70/warc/CC-MAIN-20170525025250-20170525045250-00226.warc.gz
 * crawl-data/CC-MAIN-2017-39/segments/1505818692236.58/robotstxt/CC-MAIN-20170925164022-20170925184022-00500.warc.gz
 * crawl-data/CC-MAIN-2017-39/segments/1505818690591.29/crawldiagnostics/CC-MAIN-20170925092813-20170925112813-00244.warc.gz
 * crawl-data/CC-MAIN-2018-13/segments/1521257647498.68/warc/CC-MAIN-20180320150533-20180320170533-00380.warc.gz
 * crawl-data/CC-MAIN-2020-50/segments/1606141181179.12/crawldiagnostics/CC-MAIN-20201125041943-20201125071943-00291.warc.gz
 * crawl-data/CC-MAIN-2026-12/segments/1772687277331.4/warc/CC-MAIN-20260305223500-20260306013500-00868.warc.gz
 */

function parseCommonCrawlFilenameInternal(
  filename: string,
): ParsedRecordFilenameResult | undefined {
  // New style filename for crawls in 2013 and later
  if (filename.startsWith("crawl-data/CC-MAIN-")) {
    const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
    if (!baseName) {
      return undefined;
    }
    const recordFormat = parseRecordFormatFromArchiveFilename(filename);

    const parts = baseName.split("-");

    const crawlIdentifier1 = parts.shift();
    const crawlIdentifier2 = parts.shift();
    if (crawlIdentifier1 !== "CC" || crawlIdentifier2 !== "MAIN") {
      return undefined;
    }

    const segmentMatch = filename.match(/crawl-data\/(.*?)\/segments\/(.*?)\/(.*?)\//);
    if (!segmentMatch) {
      return undefined;
    }
    const [collection, segment, subset] = segmentMatch.slice(1);
    const [segmentTimestamp, partition] = segment.split(".");

    const startTimestampRaw = parts.shift();
    const startTimestamp = DateTime.fromFormat(startTimestampRaw ?? "", "yyyyMMddHHmmss", {
      zone: "UTC",
    });
    if (!startTimestamp.isValid) {
      return undefined;
    }
    const nextPart = parts.shift();
    //

    if (nextPart?.length === 14) {
      // CC-MAIN-2017-22
      const endTimestampRaw = nextPart;
      const endTimestamp = DateTime.fromFormat(endTimestampRaw ?? "", "yyyyMMddHHmmss", {
        zone: "UTC",
      });
      if (!endTimestamp.isValid) {
        return undefined;
      }
      const serialNumber = parts.pop();
      if (!serialNumber) {
        return undefined;
      }
      return {
        confidence: 1,
        filenameType: "commoncrawl-2017",
        recordFormat,
        details: {
          crawlIdentifier: collection,
          crawlProvider: "commoncrawl",
          fileWriteStartTimestamp: startTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
          fileWriteEndTimestamp: endTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
          fileSerialNumber: serialNumber,
          crawlCollectionId: collection,
          filePartition: partition,
          crawlSubset: subset,
          fileSegment: partition ? `${segmentTimestamp}.${partition}` : segmentTimestamp,
          fileSegmentTimestamp: DateTime.fromMillis(+segmentTimestamp).toUTC().toISO() ?? undefined,
        },
      };
    } else if (nextPart?.length === 5) {
      // CC-MAIN-2013
      const serialNumber = nextPart;
      const crawlerName = parts.join("-");
      return {
        confidence: 1,
        filenameType: "commoncrawl-2013",
        recordFormat,
        details: {
          crawlIdentifier: collection,
          crawlProvider: "commoncrawl",
          fileWriteStartTimestamp: startTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
          fileSerialNumber: serialNumber,
          crawlerName,
          crawlCollectionId: collection,
          filePartition: partition,
          crawlSubset: subset,
          fileSegment: partition ? `${segmentTimestamp}.${partition}` : segmentTimestamp,
          fileSegmentTimestamp: DateTime.fromMillis(+segmentTimestamp).toUTC().toISO() ?? undefined,
        },
      };
    }
  } else if (filename.startsWith("parse-output")) {
    // 2012 style filename
    const partsMatch = filename.match(/parse-output\/segment\/(\d+)\/(\d+)_(\d+)\.arc\.gz/);
    if (!partsMatch) {
      return undefined;
    }
    const [segmentTimestamp, timestamp, partition] = partsMatch.slice(1);
    return {
      confidence: 1,
      filenameType: "commoncrawl-2012",
      recordFormat: "arc" as const,
      details: {
        crawlIdentifier: "CC-MAIN-2012",
        crawlProvider: "commoncrawl",
        fileWriteStartTimestamp: DateTime.fromMillis(+timestamp).toUTC().toISO() ?? undefined,
        crawlCollectionId: "CC-MAIN-2012",
        filePartition: partition,
        fileSegment: segmentTimestamp,
        fileSegmentTimestamp: DateTime.fromMillis(+segmentTimestamp).toUTC().toISO() ?? undefined,
      },
    } satisfies ParsedRecordFilenameResult;
  } else if (filename.startsWith("crawl-001") || filename.startsWith("crawl-002")) {
    // Old style filename from 2008-2010
    const partsMatch = filename.match(
      /crawl-(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\/(\d+)_(\d+)\.arc\.gz/,
    );
    if (!partsMatch) {
      return undefined;
    }
    const [crawlNumber, year, month, day, hour, timestamp, partition] = partsMatch.slice(1);
    return {
      confidence: 1,
      filenameType: "commoncrawl-2008",
      recordFormat: "arc" as const,
      details: {
        crawlIdentifier: crawlNumber === "001" ? "CC-MAIN-2008-2009" : "CC-MAIN-2009-2010",
        crawlOriginalIdentifier: crawlNumber === "001" ? "crawl-001" : "crawl-002",
        crawlProvider: "commoncrawl",
        fileWriteStartTimestamp: DateTime.fromMillis(+timestamp).toUTC().toISO() ?? undefined,
        crawlCollectionId: crawlNumber === "001" ? "CC-MAIN-2008-2009" : "CC-MAIN-2009-2010",
        filePartition: partition,
        fileSegment: `${year}/${month}/${day}/${hour}`,
      },
    };
  } else {
    return undefined;
  }
}

export function parseCommonCrawlFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const result = parseCommonCrawlFilenameInternal(filename);
  return result ? [cleanUpRecordFilenameResult(result)] : [];
}

export function parseCommonCrawlFilenamePickBest(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  const candidates = parseCommonCrawlFilename(filename, captureTimestamp);
  return candidates[0];
}
