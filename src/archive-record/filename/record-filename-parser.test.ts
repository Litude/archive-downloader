import { describe, it, expect } from "vitest";
import { parseCommonCrawlFilename, parseRecordFilename } from "./record-filename-parser.js";
import { parseRecordFormatFromArchiveFilename } from "./filename-parser-common.js";

describe("parseRecordFormatFromArchiveFilename", () => {
  it("returns 'warc' for a .warc.gz filename", () => {
    expect(
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.warc.gz"),
    ).toBe("warc");
  });

  it("returns 'arc' for a .arc filename", () => {
    expect(parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.arc")).toBe(
      "arc",
    );
  });

  it("returns 'warc' for a .warc.zst filename", () => {
    expect(
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.warc.zst"),
    ).toBe("warc");
  });

  it("throws for an unknown extension", () => {
    expect(() =>
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.zip"),
    ).toThrow("Unknown record format");
  });
});

describe("parseRecordFilename", () => {
  it("returns undefined for a filename whose timestamp part is not 14 digits", () => {
    expect(parseRecordFilename("CC-MAIN-2021030100-00000-crawler.warc.gz")).toBeUndefined();
  });

  it("returns parsed filename for archive.org format filename", () => {
    expect(
      parseRecordFilename(
        "BNF-FOCUSEDCRAWL-001-20051025163005-09264-crawling013-c/BNF-FOCUSEDCRAWL-001-20051025211253-09395-crawling013.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "BNF-FOCUSEDCRAWL-001",
      timestamp: "20051025211253",
      serialNumber: "09395",
      crawlerName: "crawling013",
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "TSUNAMI-07-20050202183353-00016-crawling001-c/TSUNAMI-07-20050203030220-00206-crawling001.archive.org.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "TSUNAMI-07",
      timestamp: "20050203030220",
      serialNumber: "00206",
      crawlerName: "crawling001.archive.org",
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "portuguese-web-archive-AWP12008-20080305061523/IAH-20080305064923-18702-T1.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "IAH",
      timestamp: "20080305064923",
      serialNumber: "18702",
      crawlerName: "T1",
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "ARCHIVEIT-1553-20090721002816-00000-crawling04-c/ARCHIVEIT-1553-20090730213328-00010-crawling04.us.archive.org.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "ARCHIVEIT-1553",
      timestamp: "20090730213328",
      serialNumber: "00010",
      crawlerName: "crawling04.us.archive.org",
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "NLA-AU-CRAWL-005-20110412073635-01590-00710-crawling213/NLA-AU-CRAWL-005-20110412084503-01600-crawling213.us.archive.org.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "NLA-AU-CRAWL-005",
      timestamp: "20110412084503",
      serialNumber: "01600",
      crawlerName: "crawling213.us.archive.org",
      recordFormat: "warc",
    });

    expect(parseRecordFilename("NLNZ-TI1179651-20091006011055-00000-kaiwae-z11.arc")).toEqual({
      crawlIdentifier: "NLNZ-TI1179651",
      timestamp: "20091006011055",
      serialNumber: "00000",
      crawlerName: "kaiwae-z11",
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "green-0057-19990201170112-918029730-c/green-0065-19990201170112-918066743.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "green-0065",
      timestamp: "19990201170112",
      serialNumber: "918066743",
      crawlerName: undefined,
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "sarah-000242-20000526155711-959634521-c/sarah-000246-20000526155711-959651014.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "sarah-000246",
      timestamp: "20000526155711",
      serialNumber: "959651014",
      crawlerName: undefined,
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "20001018.000217-20001026154306-972602368-c/20001018.000221-20001026182205-972613419.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "20001018.000221",
      timestamp: "20001026182205",
      serialNumber: "972613419",
      crawlerName: undefined,
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "NLA-AU-CRAWL-005-20110310025854-crawling119/NLA-AU-CRAWL-005-20110310030010-00188.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "NLA-AU-CRAWL-005",
      timestamp: "20110310030010",
      serialNumber: "00188",
      crawlerName: undefined,
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "ARCHIVEIT-969-QUARTERLY-9606-00000/ARCHIVEIT-969-QUARTERLY-9606-20140512040133138-00007-wbgrp-crawl058.us.archive.org-6442.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "ARCHIVEIT-969-QUARTERLY-9606",
      timestamp: "20140512040133138",
      serialNumber: "00007",
      crawlerName: "wbgrp-crawl058.us.archive.org-6442",
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "NO404-WKP-20131022040845-crawl345/NO404-WKP-20131022042105-05331.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "NO404-WKP",
      timestamp: "20131022042105",
      serialNumber: "05331",
      crawlerName: undefined,
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename("WIDE-20140929185313-crawl427/WIDE-20140929194402-05766.warc.gz"),
    ).toEqual({
      crawlIdentifier: "WIDE",
      timestamp: "20140929194402",
      serialNumber: "05766",
      crawlerName: undefined,
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "ACC-20060319150435-04321-c01.ba.accelovation.com-c/ACC-20060319173715-01993-c05.ba.accelovation.com.arc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "ACC",
      timestamp: "20060319173715",
      serialNumber: "01993",
      crawlerName: "c05.ba.accelovation.com",
      recordFormat: "arc",
    });

    expect(
      parseRecordFilename(
        "portuguese-web-archive-AWP35-2020-0743/WEB-20201202203038195-p100.arquivo.pt.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "WEB",
      timestamp: "20201202203038195",
      serialNumber: undefined,
      crawlerName: "p100.arquivo.pt",
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "IA-COLLIE-002-20211017071236297-06654-06662-wbgrp-crawl302/IA-COLLIE-002-20211017071951336-06655-21509~wbgrp-crawl302.us.archive.org~8443.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "IA-COLLIE-002",
      timestamp: "20211017071951336",
      serialNumber: "06655",
      crawlerName: "21509~wbgrp-crawl302.us.archive.org~8443",
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "WIDE-20101224112432662-01895-01913-ia360910/WIDE-20101224133815595-01909-29002~ia360910.us.archive.org~9443.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "WIDE",
      timestamp: "20101224133815595",
      serialNumber: "01909",
      crawlerName: "29002~ia360910.us.archive.org~9443",
      recordFormat: "warc",
    });

    expect(
      parseRecordFilename(
        "crawl-data/CC-MAIN-2014-15/segments/1398223206647.11/warc/CC-MAIN-20140423032006-00221-ip-10-147-4-33.ec2.internal.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "CC-MAIN",
      timestamp: "20140423032006",
      serialNumber: "00221",
      crawlerName: "ip-10-147-4-33.ec2.internal",
      recordFormat: "warc",
    });
  });

  it("returns undefined for non-archive.org format filename", () => {
    expect(
      parseRecordFilename(
        "EF_dad_9_0_crawl22_.20051014235118-c/EF_dad_9_0_crawl22_.20051016002521.arc.gz",
      ),
    ).toBeUndefined();
    expect(parseRecordFilename("GR-411182-c/GR-411372.arc.gz")).toBeUndefined();
    expect(
      parseRecordFilename(
        "archiveteam_archivebot_go_20141206160004/pcgamingwiki.com-inf-20141205-041914-89hy7-00002.warc.gz",
      ),
    ).toBeUndefined();
    expect(
      parseRecordFilename(
        "archiveteam_urls_20210418103848_5e8e77b1/urls_20210418103848_5e8e77b1.1606352862.megawarc.warc.zst",
      ),
    ).toBeUndefined();
  });
});

describe("parseCommonCrawlFilename", () => {
  it("parses commoncrawl 2008-2010 corpus filename correctly", () => {
    expect(parseCommonCrawlFilename("crawl-001/2008/06/25/11/1214440586619_11.arc.gz")).toEqual({
      crawlIdentifier: "CC-MAIN-2008-2009",
      timestamp: "20080626003626619",
      partition: "11",
      recordFormat: "arc",
      segment: "2008/06/25/11",
    });

    expect(parseCommonCrawlFilename("crawl-002/2009/09/17/41/1253233750985_41.arc.gz")).toEqual({
      crawlIdentifier: "CC-MAIN-2009-2010",
      timestamp: "20090918002910985",
      partition: "41",
      recordFormat: "arc",
      segment: "2009/09/17/41",
    });
  });

  it("parses commoncrawl 2012 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilename("parse-output/segment/1346981172186/1346994935837_1048.arc.gz"),
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2012",
      timestamp: "20120907051535837",
      partition: "1048",
      recordFormat: "arc",
      segment: "1346981172186",
      segmentTimestamp: "20120907012612186",
    });
  });

  it("parses commoncrawl 2013 corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilename(
        "crawl-data/CC-MAIN-2013-20/segments/1368706009988/warc/CC-MAIN-20130516120649-00096-ip-10-60-113-184.ec2.internal.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2013-20",
      crawlerName: "ip-10-60-113-184.ec2.internal",
      serialNumber: "00096",
      partition: undefined,
      timestamp: "20130516120649",
      recordFormat: "warc",
      segment: "1368706009988",
      segmentTimestamp: "20130516120649988",
    });
  });

  it("parses commoncrawl 2014+ corpus filename correctly", () => {
    expect(
      parseCommonCrawlFilename(
        "crawl-data/CC-MAIN-2014-15/segments/1398223206647.11/warc/CC-MAIN-20140423032006-00221-ip-10-147-4-33.ec2.internal.warc.gz",
      ),
    ).toEqual({
      crawlIdentifier: "CC-MAIN-2014-15",
      crawlerName: "ip-10-147-4-33.ec2.internal",
      serialNumber: "00221",
      partition: "11",
      timestamp: "20140423032006",
      recordFormat: "warc",
      segment: "1398223206647.11",
      segmentTimestamp: "20140423032006647",
    });
  });
});
