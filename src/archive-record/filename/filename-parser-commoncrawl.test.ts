import { describe, it, expect } from "vitest";
import { parseCommonCrawlFilenamePickBest } from "./filename-parser-commoncrawl.js";

describe("parseCommonCrawlFilename", () => {
  it("parses commoncrawl 2008-2010 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest("crawl-001/2008/06/25/11/1214440586619_11.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2008-2009",
      crawlOriginalIdentifier: "crawl-001",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2008-2009",
      fileWriteStartTimestamp: "2008-06-26T00:36:26.619Z",
      filePartition: "11",
      fileSegment: "2008/06/25/11",
    });

    expect(
      parseCommonCrawlFilenamePickBest("crawl-002/2009/09/17/41/1253233750985_41.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2009-2010",
      crawlOriginalIdentifier: "crawl-002",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2009-2010",
      fileWriteStartTimestamp: "2009-09-18T00:29:10.985Z",
      filePartition: "41",
      fileSegment: "2009/09/17/41",
    });
  });

  it("parses commoncrawl 2012 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "parse-output/segment/1346981172186/1346994935837_1048.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2012",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2012",
      fileWriteStartTimestamp: "2012-09-07T05:15:35.837Z",
      filePartition: "1048",
      fileSegment: "1346981172186",
      fileSegmentTimestamp: "2012-09-07T01:26:12.186Z",
    });
  });

  it("parses commoncrawl 2013 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2013-20/segments/1368706009988/warc/CC-MAIN-20130516120649-00096-ip-10-60-113-184.ec2.internal.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2013-20",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2013-20",
      crawlSubset: "warc",
      crawlerName: "ip-10-60-113-184.ec2.internal",
      fileWriteStartTimestamp: "2013-05-16T12:06:49Z",
      fileSerialNumber: "00096",
      fileSegment: "1368706009988",
      fileSegmentTimestamp: "2013-05-16T12:06:49.988Z",
    });
  });

  it("parses commoncrawl 2014+ corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2014-15/segments/1398223206647.11/warc/CC-MAIN-20140423032006-00221-ip-10-147-4-33.ec2.internal.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2014-15",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2014-15",
      crawlSubset: "warc",
      crawlerName: "ip-10-147-4-33.ec2.internal",
      fileWriteStartTimestamp: "2014-04-23T03:20:06Z",
      fileSerialNumber: "00221",
      filePartition: "11",
      fileSegment: "1398223206647.11",
      fileSegmentTimestamp: "2014-04-23T03:20:06.647Z",
    });
  });

  it("parses commoncrawl 2017+ corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2017-39/segments/1505818692236.58/robotstxt/CC-MAIN-20170925164022-20170925184022-00500.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2017-39",
      crawlProvider: "commoncrawl",
      crawlCollectionId: "CC-MAIN-2017-39",
      crawlSubset: "robotstxt",
      fileWriteStartTimestamp: "2017-09-25T16:40:22Z",
      fileWriteEndTimestamp: "2017-09-25T18:40:22Z",
      fileSerialNumber: "00500",
      filePartition: "58",
      fileSegment: "1505818692236.58",
      fileSegmentTimestamp: "2017-09-19T10:58:12.236Z",
    });
  });
});
