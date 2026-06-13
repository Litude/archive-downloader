import { describe, it, expect } from "vitest";
import { parseAlexaRecordFilenamePickBest } from "./filename-parser-alexa.js";

describe("parseAlexaRecordFilename", () => {
  it("parses 1996 crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("FS-087249.arc.gz")?.details).toEqual({
      crawlIdentifier: "FS",
      crawlProvider: "alexa",
      crawlerName: "firestone",
      fileSerialNumber: "087249",
    });

    expect(parseAlexaRecordFilenamePickBest("GR-034753.arc.gz")?.details).toEqual({
      crawlIdentifier: "GR",
      crawlProvider: "alexa",
      crawlerName: "green",
      fileSerialNumber: "034753",
    });

    expect(parseAlexaRecordFilenamePickBest("ST-000246.arc.gz")?.details).toEqual({
      crawlIdentifier: "ST",
      crawlProvider: "alexa",
      crawlerName: "sterling",
      fileSerialNumber: "000246",
    });

    // IA tag maps to widener crawler
    expect(parseAlexaRecordFilenamePickBest("IA-000150X.arc.gz")?.details).toEqual({
      crawlIdentifier: "IA",
      crawlProvider: "alexa",
      crawlerName: "widener",
      fileSerialNumber: "000150X",
    });

    // Election 1996 special case
    expect(parseAlexaRecordFilenamePickBest("IA-E96-10.arc.gz")?.details).toEqual({
      crawlIdentifier: "IA-E96",
      crawlProvider: "alexa",
      crawlerName: "widener",
      fileSerialNumber: "10",
    });
  });

  it("parses 1998 crawl filenames correctly", () => {
    // Simple epoch-only format
    expect(parseAlexaRecordFilenamePickBest("green-0030-912577479.arc.gz")?.details).toEqual({
      crawlIdentifier: "green",
      crawlProvider: "alexa",
      crawlerName: "green",
      fileWriteStartTimestamp: "1998-12-02T05:44:39Z",
      fileSerialNumber: "0030",
    });

    // With batch timestamp
    expect(
      parseAlexaRecordFilenamePickBest("green-0030-19990417120238-924396460.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "green",
      crawlProvider: "alexa",
      crawlerName: "green",
      crawlBatchStartTimestamp: "1999-04-17T19:02:38Z",
      fileWriteStartTimestamp: "1999-04-18T00:47:40Z",
      fileSerialNumber: "0030",
    });

    expect(
      parseAlexaRecordFilenamePickBest("sarah-000072-19991113205559-942601339.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "sarah",
      crawlProvider: "alexa",
      crawlerName: "sarah",
      crawlBatchStartTimestamp: "1999-11-14T04:55:59Z",
      fileWriteStartTimestamp: "1999-11-14T17:42:19Z",
      fileSerialNumber: "000072",
    });

    // No serial number
    expect(parseAlexaRecordFilenamePickBest("slash-913417727.arc.gz")?.details).toEqual({
      crawlIdentifier: "slash",
      crawlProvider: "alexa",
      crawlerName: "green",
      fileWriteStartTimestamp: "1998-12-11T23:08:47Z",
    });

    // With crawl date
    expect(parseAlexaRecordFilenamePickBest("to-19990116-916524615.arc.gz")?.details).toEqual({
      crawlIdentifier: "to",
      crawlProvider: "alexa",
      crawlerName: "green",
      crawlStartDate: "1999-01-16",
      fileWriteStartTimestamp: "1999-01-16T22:10:15Z",
    });

    // Hyphenated identifier with serial, batch timestamp
    expect(
      parseAlexaRecordFilenamePickBest("to-crawl-000000-20000519142052-958771735.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "to-crawl",
      crawlProvider: "alexa",
      crawlerName: "crawl1",
      crawlBatchStartTimestamp: "2000-05-19T21:20:52Z",
      fileWriteStartTimestamp: "2000-05-19T21:28:55Z",
      fileSerialNumber: "000000",
    });

    expect(
      parseAlexaRecordFilenamePickBest("amazon-000006-19990921170308-937969043.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "amazon",
      crawlProvider: "alexa",
      crawlBatchStartTimestamp: "1999-09-22T00:03:08Z",
      fileWriteStartTimestamp: "1999-09-22T02:57:23Z",
      fileSerialNumber: "000006",
    });
  });

  it("parses 2000-06 Recy crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("Recy20000602aa-960022519.arc.gz")?.details).toEqual({
      crawlIdentifier: "Recy20000602",
      crawlProvider: "alexa",
      crawlStartDate: "2000-06-02",
      fileWriteStartTimestamp: "2000-06-03T08:55:19Z",
      fileSerialNumber: "aa",
    });
  });

  it("parses 2000-07 crawl filenames correctly", () => {
    expect(
      parseAlexaRecordFilenamePickBest("20000710.000033-20000712015206-963392503.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "20000710",
      crawlProvider: "alexa",
      crawlStartDate: "2000-07-10",
      crawlBatchStartTimestamp: "2000-07-12T08:52:06Z",
      fileWriteStartTimestamp: "2000-07-12T09:01:43Z",
      fileSerialNumber: "000033",
    });

    expect(
      parseAlexaRecordFilenamePickBest("20000929.000068-20001005011008-970740821.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "20000929",
      crawlProvider: "alexa",
      crawlStartDate: "2000-09-29",
      crawlBatchStartTimestamp: "2000-10-05T08:10:08Z",
      fileWriteStartTimestamp: "2000-10-05T10:13:41Z",
      fileSerialNumber: "000068",
    });
  });

  it("parses 2000-11 crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("crc22.20001109160358.arc.gz")?.details).toEqual({
      crawlIdentifier: "crc22",
      crawlProvider: "alexa",
      crawlerName: "crc22",
      fileWriteStartTimestamp: "2000-11-09T16:03:58Z",
    });

    expect(parseAlexaRecordFilenamePickBest("arc38.20001201173428.arc.gz")?.details).toEqual({
      crawlIdentifier: "arc38",
      crawlProvider: "alexa",
      crawlerName: "arc38",
      fileWriteStartTimestamp: "2000-12-01T17:34:28Z",
    });
  });

  it("parses 2001-05 crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("DD_arc22.20010204140533.arc.gz")?.details).toEqual({
      crawlIdentifier: "DD",
      crawlGenerationCode: "DD",
      crawlProvider: "alexa",
      crawlerName: "arc22",
      fileWriteStartTimestamp: "2001-02-04T14:05:33Z",
    });

    expect(parseAlexaRecordFilenamePickBest("DE_crawl2.20010413151635.arc.gz")?.details).toEqual({
      crawlIdentifier: "DE",
      crawlGenerationCode: "DE",
      crawlProvider: "alexa",
      crawlerName: "crawl2",
      fileWriteStartTimestamp: "2001-04-13T15:16:35Z",
    });

    expect(parseAlexaRecordFilenamePickBest("NEWS0_crawl3.20011108131420.arc.gz")?.details).toEqual(
      {
        crawlIdentifier: "NEWS0",
        crawlProvider: "alexa",
        crawlerName: "crawl3",
        fileWriteStartTimestamp: "2001-11-08T13:14:20Z",
      },
    );

    // With subset
    expect(
      parseAlexaRecordFilenamePickBest("DX_images_crawl30.20040608014709.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "DX_images",
      crawlGenerationCode: "DX",
      crawlProvider: "alexa",
      crawlSubset: "images",
      crawlerName: "crawl30",
      fileWriteStartTimestamp: "2004-06-08T01:47:09Z",
    });

    expect(
      parseAlexaRecordFilenamePickBest("DX_dad_crawl31.20040611073353.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "DX_dad",
      crawlGenerationCode: "DX",
      crawlProvider: "alexa",
      crawlSubset: "dad",
      crawlerName: "crawl31",
      fileWriteStartTimestamp: "2004-06-11T07:33:53Z",
    });
  });

  it("parses 2002 election crawl filenames correctly", () => {
    expect(
      parseAlexaRecordFilenamePickBest("E02_1h_0371_crawl3.20021118200003.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "E02_1h",
      crawlProvider: "alexa",
      crawlInterval: "1h",
      crawlerName: "crawl3",
      fileWriteStartTimestamp: "2002-11-18T20:00:03Z",
      fileSerialNumber: "0371",
    });

    expect(
      parseAlexaRecordFilenamePickBest("E02_1w_08_crawl8.20020808183624.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "E02_1w",
      crawlProvider: "alexa",
      crawlInterval: "1w",
      crawlerName: "crawl8",
      fileWriteStartTimestamp: "2002-08-08T18:36:24Z",
      fileSerialNumber: "08",
    });
  });

  it("parses 2005-08 crawl filenames correctly", () => {
    expect(
      parseAlexaRecordFilenamePickBest("EE_1_0_crawl26_.20050816083846.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "EE_1_0",
      crawlProvider: "alexa",
      crawlGenerationCode: "EE",
      crawlSequence: 1,
      crawlRun: 0,
      crawlerName: "crawl26",
      fileWriteStartTimestamp: "2005-08-16T08:38:46Z",
    });

    expect(
      parseAlexaRecordFilenamePickBest("EE_dad_4_0_crawl25_.20051004072013.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "EE_dad_4_0",
      crawlProvider: "alexa",
      crawlGenerationCode: "EE",
      crawlSequence: 4,
      crawlRun: 0,
      crawlSubset: "dad",
      crawlerName: "crawl25",
      fileWriteStartTimestamp: "2005-10-04T07:20:13Z",
    });

    expect(
      parseAlexaRecordFilenamePickBest("EE_images_2_0_crawl28_.20051001132702.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "EE_images_2_0",
      crawlProvider: "alexa",
      crawlGenerationCode: "EE",
      crawlSequence: 2,
      crawlRun: 0,
      crawlSubset: "images",
      crawlerName: "crawl28",
      fileWriteStartTimestamp: "2005-10-01T13:27:02Z",
    });
  });

  it("parses 2006-06 crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("26_0_20060610014940_crawl23.arc.gz")?.details).toEqual(
      {
        crawlIdentifier: "26_0",
        crawlProvider: "alexa",
        crawlSequence: 26,
        crawlRun: 0,
        crawlerName: "crawl23",
        fileWriteStartTimestamp: "2006-06-10T01:49:40Z",
      },
    );

    // IndexOnly subset
    expect(
      parseAlexaRecordFilenamePickBest("52_19_20110109163559_crawl103_IndexOnly.arc.gz")?.details,
    ).toEqual({
      crawlIdentifier: "52_19_IndexOnly",
      crawlProvider: "alexa",
      crawlSequence: 52,
      crawlRun: 19,
      crawlSubset: "IndexOnly",
      crawlerName: "crawl103",
      fileWriteStartTimestamp: "2011-01-09T16:35:59Z",
    });
  });

  it("parses 2000-04 image crawl filenames correctly", () => {
    // Numeric tuning parameter
    expect(parseAlexaRecordFilenamePickBest("short1-2-25-957463952.arc.gz")?.details).toEqual({
      crawlIdentifier: "short1",
      crawlProvider: "alexa",
      crawlTuningParameter: 25,
      crawlerNode: "2",
      fileWriteStartTimestamp: "2000-05-04T18:12:32Z",
    });

    // Alphabetic serial (crc prefix uses serial instead of tuning parameter)
    expect(parseAlexaRecordFilenamePickBest("crc14-2-aa-958451168.arc.gz")?.details).toEqual({
      crawlIdentifier: "crc14",
      crawlProvider: "alexa",
      crawlerName: "crc14",
      crawlerNode: "2",
      fileWriteStartTimestamp: "2000-05-16T04:26:08Z",
      fileSerialNumber: "aa",
    });
  });

  it("parses 2000-07 image crawl filenames correctly", () => {
    expect(parseAlexaRecordFilenamePickBest("IMG_AAA_SUBaj-965455500.arc.gz")?.details).toEqual({
      crawlIdentifier: "IMG_AAA",
      crawlProvider: "alexa",
      crawlGenerationCode: "AAA",
      fileWriteStartTimestamp: "2000-08-05T06:05:00Z",
      fileSerialNumber: "aj",
    });

    // With sub-identifier number suffix
    expect(parseAlexaRecordFilenamePickBest("IMG_AAL_SUBaa_1-967018030.arc.gz")?.details).toEqual({
      crawlIdentifier: "IMG_AAL",
      crawlProvider: "alexa",
      crawlGenerationCode: "AAL",
      fileWriteStartTimestamp: "2000-08-23T08:07:10Z",
      fileSerialNumber: "aa_1",
    });
  });
});
