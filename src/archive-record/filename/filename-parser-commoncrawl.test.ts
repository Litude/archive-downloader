import { describe, it, expect } from "vitest";
import { parseCommonCrawlFilenamePickBest } from "./filename-parser-commoncrawl.js";

describe("parseCommonCrawlFilename", () => {
  it("parses commoncrawl 2008-2010 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest("crawl-001/2008/06/25/11/1214440586619_11.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2008-2009",
      crawlInfrastructure: "commoncrawl",
      startTimestamp: "2008-06-26T00:36:26.619Z",
      partition: "11",
      segment: "2008/06/25/11",
    });

    expect(
      parseCommonCrawlFilenamePickBest("crawl-002/2009/09/17/41/1253233750985_41.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2009-2010",
      crawlInfrastructure: "commoncrawl",
      startTimestamp: "2009-09-18T00:29:10.985Z",
      partition: "41",
      segment: "2009/09/17/41",
    });
  });

  it("parses commoncrawl 2012 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "parse-output/segment/1346981172186/1346994935837_1048.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2012",
      crawlInfrastructure: "commoncrawl",
      startTimestamp: "2012-09-07T05:15:35.837Z",
      partition: "1048",
      segment: "1346981172186",
      segmentTimestamp: "2012-09-07T01:26:12.186Z",
    });
  });

  it("parses commoncrawl 2013 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2013-20/segments/1368706009988/warc/CC-MAIN-20130516120649-00096-ip-10-60-113-184.ec2.internal.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2013-20",
      crawlInfrastructure: "commoncrawl",
      crawlerName: "ip-10-60-113-184.ec2.internal",
      serialNumber: "00096",
      partition: undefined,
      startTimestamp: "2013-05-16T12:06:49Z",
      subset: "warc",
      segment: "1368706009988",
      segmentTimestamp: "2013-05-16T12:06:49.988Z",
    });
  });

  it("parses commoncrawl 2014+ corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2014-15/segments/1398223206647.11/warc/CC-MAIN-20140423032006-00221-ip-10-147-4-33.ec2.internal.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2014-15",
      crawlInfrastructure: "commoncrawl",
      crawlerName: "ip-10-147-4-33.ec2.internal",
      serialNumber: "00221",
      partition: "11",
      startTimestamp: "2014-04-23T03:20:06Z",
      subset: "warc",
      segment: "1398223206647.11",
      segmentTimestamp: "2014-04-23T03:20:06.647Z",
    });
  });

  it("parses commoncrawl 2017+ corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilenamePickBest(
        "crawl-data/CC-MAIN-2017-39/segments/1505818692236.58/robotstxt/CC-MAIN-20170925164022-20170925184022-00500.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2017-39",
      crawlInfrastructure: "commoncrawl",
      serialNumber: "00500",
      partition: "58",
      startTimestamp: "2017-09-25T16:40:22Z",
      endTimestamp: "2017-09-25T18:40:22Z",
      subset: "robotstxt",
      segment: "1505818692236.58",
      segmentTimestamp: "2017-09-19T10:58:12.236Z",
    });
  });
});
