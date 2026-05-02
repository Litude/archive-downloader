import { describe, it, expect } from "vitest";
import { parseGenericRecordFilenamePickBest } from "./filename-parser-generic.js";

describe("parseRecordFilename", () => {
  it("returns undefined for a filename whose timestamp part is not 14 digits", () => {
    expect(
      parseGenericRecordFilenamePickBest("CC-MAIN-2021030100-00000-crawler.warc.gz"),
    ).toBeUndefined();
  });

  it("returns parsed filename for archive.org format filename", () => {
    expect(
      parseGenericRecordFilenamePickBest(
        "BNF-FOCUSEDCRAWL-001-20051025163005-09264-crawling013-c/BNF-FOCUSEDCRAWL-001-20051025211253-09395-crawling013.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "BNF-FOCUSEDCRAWL-001",
      fileWriteStartTimestamp: "2005-10-25T21:12:53Z",
      fileSerialNumber: "09395",
      crawlerName: "crawling013",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "TSUNAMI-07-20050202183353-00016-crawling001-c/TSUNAMI-07-20050203030220-00206-crawling001.archive.org.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "TSUNAMI-07",
      fileWriteStartTimestamp: "2005-02-03T03:02:20Z",
      fileSerialNumber: "00206",
      crawlerName: "crawling001.archive.org",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "portuguese-web-archive-AWP12008-20080305061523/IAH-20080305064923-18702-T1.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "IAH",
      fileWriteStartTimestamp: "2008-03-05T06:49:23Z",
      fileSerialNumber: "18702",
      crawlerName: "T1",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "ARCHIVEIT-1553-20090721002816-00000-crawling04-c/ARCHIVEIT-1553-20090730213328-00010-crawling04.us.archive.org.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "ARCHIVEIT-1553",
      fileWriteStartTimestamp: "2009-07-30T21:33:28Z",
      fileSerialNumber: "00010",
      crawlerName: "crawling04.us.archive.org",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "NLA-AU-CRAWL-005-20110412073635-01590-00710-crawling213/NLA-AU-CRAWL-005-20110412084503-01600-crawling213.us.archive.org.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "NLA-AU-CRAWL-005",
      fileWriteStartTimestamp: "2011-04-12T08:45:03Z",
      fileSerialNumber: "01600",
      crawlerName: "crawling213.us.archive.org",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest("NLNZ-TI1179651-20091006011055-00000-kaiwae-z11.arc")
        ?.details,
    ).toEqual({
      crawlIdentifier: "NLNZ-TI1179651",
      fileWriteStartTimestamp: "2009-10-06T01:10:55Z",
      fileSerialNumber: "00000",
      crawlerName: "kaiwae-z11",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "green-0057-19990201170112-918029730-c/green-0065-19990201170112-918066743.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "green-0065",
      fileWriteStartTimestamp: "1999-02-01T17:01:12Z",
      fileSerialNumber: "918066743",
      crawlerName: undefined,
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "sarah-000242-20000526155711-959634521-c/sarah-000246-20000526155711-959651014.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "sarah-000246",
      fileWriteStartTimestamp: "2000-05-26T15:57:11Z",
      fileSerialNumber: "959651014",
      crawlerName: undefined,
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "NLA-AU-CRAWL-005-20110310025854-crawling119/NLA-AU-CRAWL-005-20110310030010-00188.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "NLA-AU-CRAWL-005",
      fileWriteStartTimestamp: "2011-03-10T03:00:10Z",
      fileSerialNumber: "00188",
      crawlerName: undefined,
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "ARCHIVEIT-969-QUARTERLY-9606-00000/ARCHIVEIT-969-QUARTERLY-9606-20140512040133138-00007-wbgrp-crawl058.us.archive.org-6442.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "ARCHIVEIT-969-QUARTERLY-9606",
      fileWriteStartTimestamp: "2014-05-12T04:01:33.138Z",
      fileSerialNumber: "00007",
      crawlerName: "wbgrp-crawl058.us.archive.org:6442",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "NO404-WKP-20131022040845-crawl345/NO404-WKP-20131022042105-05331.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "NO404-WKP",
      fileWriteStartTimestamp: "2013-10-22T04:21:05Z",
      fileSerialNumber: "05331",
      crawlerName: undefined,
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "WIDE-20140929185313-crawl427/WIDE-20140929194402-05766.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "WIDE",
      fileWriteStartTimestamp: "2014-09-29T19:44:02Z",
      fileSerialNumber: "05766",
      crawlerName: undefined,
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "ACC-20060319150435-04321-c01.ba.accelovation.com-c/ACC-20060319173715-01993-c05.ba.accelovation.com.arc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "ACC",
      fileWriteStartTimestamp: "2006-03-19T17:37:15Z",
      fileSerialNumber: "01993",
      crawlerName: "c05.ba.accelovation.com",
      crawlProvider: "accelovation",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "portuguese-web-archive-AWP35-2020-0743/WEB-20201202203038195-p100.arquivo.pt.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "WEB",
      fileWriteStartTimestamp: "2020-12-02T20:30:38.195Z",
      fileSerialNumber: undefined,
      crawlerName: "p100.arquivo.pt",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "IA-COLLIE-002-20211017071236297-06654-06662-wbgrp-crawl302/IA-COLLIE-002-20211017071951336-06655-21509~wbgrp-crawl302.us.archive.org~8443.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "IA-COLLIE-002",
      fileWriteStartTimestamp: "2021-10-17T07:19:51.336Z",
      fileSerialNumber: "06655",
      crawlerPid: "21509",
      crawlerName: "wbgrp-crawl302.us.archive.org:8443",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "WIDE-20101224112432662-01895-01913-ia360910/WIDE-20101224133815595-01909-29002~ia360910.us.archive.org~9443.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "WIDE",
      fileWriteStartTimestamp: "2010-12-24T13:38:15.595Z",
      fileSerialNumber: "01909",
      crawlerPid: "29002",
      crawlerName: "ia360910.us.archive.org:9443",
      crawlProvider: "internetarchive",
    });

    expect(
      parseGenericRecordFilenamePickBest(
        "crawl-data/CC-MAIN-2014-15/segments/1398223206647.11/warc/CC-MAIN-20140423032006-00221-ip-10-147-4-33.ec2.internal.warc.gz",
      )?.details,
    ).toEqual({
      crawlIdentifier: "CC-MAIN",
      fileWriteStartTimestamp: "2014-04-23T03:20:06Z",
      fileSerialNumber: "00221",
      crawlerName: "ip-10-147-4-33.ec2.internal",
    });
  });

  it("returns undefined for custom format filename", () => {
    expect(
      parseGenericRecordFilenamePickBest(
        "EF_dad_9_0_crawl22_.20051014235118-c/EF_dad_9_0_crawl22_.20051016002521.arc.gz",
      ),
    ).toBeUndefined();
    expect(parseGenericRecordFilenamePickBest("GR-411182-c/GR-411372.arc.gz")).toBeUndefined();
    expect(
      parseGenericRecordFilenamePickBest(
        "archiveteam_archivebot_go_20141206160004/pcgamingwiki.com-inf-20141205-041914-89hy7-00002.warc.gz",
      ),
    ).toBeUndefined();
    expect(
      parseGenericRecordFilenamePickBest(
        "archiveteam_urls_20210418103848_5e8e77b1/urls_20210418103848_5e8e77b1.1606352862.megawarc.warc.zst",
      ),
    ).toBeUndefined();
  });
});
