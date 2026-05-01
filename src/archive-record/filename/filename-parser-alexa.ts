import { DateTime } from "luxon";
import {
  ParsedRecordFilenameResult,
  parseEpochSecondsFromArchiveFilename,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";
import { isDefined } from "../../utils/ts-utils.js";

// TODO: Special Alexa names, there are probably more:
// - EG_wiki_fettucine.20060110171318.arc.gz
// - crawl-20001110203809.arc.gz
// - crawl-20001110220157.arc.gz
// - crawl.20001206033146.arc.gz
// - crawl.20001213141006.arc.gz
// - 38_0_20070222235625_node03_target-product-urls-20070221.arc.gz
// - productdb.1800flowers.com.20010105144354.arc.gz
// - productdb.bedbathandbeyond.com.200101011367.arc.gz
// - productdb.zanybrainy.com.20010238316.arc.gz

const KNOWN_1996_TAGS = ["FS", "GR", "ST", "TS", "F2", "IA", "BK", "IA-E96"];

function get1996CrawlerNameFromAbbreviation(abbreviation: string): string | undefined {
  switch (abbreviation) {
    case "GR":
      return "green";
    case "FS":
      return "firestone";
    case "ST":
      return "sterling";
    case "IA": // Generic IA crawler which is known to actually only have been widener (still plausible that it could also have been some other crawler, but we have no evidence for that)
    case "IA-E96": // Election 1996 crawl, probably done by the same crawler?
      return "widener";
    case "BK": // Brewster Kahle's test crawler(???), or backup(???)
    case "TS": // Test(???)
    case "F2": // Only two arcs, probably some test again (e.g. firestone v2 test?)
    default:
      return undefined;
  }
}

function parseAlexa1996Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // FS-087249.arc.gz
  // GR-034753.arc.gz
  // ST-000246.arc.gz
  // TS-000097.arc.gz
  // F2-000001.arc.gz
  // IA-000150X.arc.gz
  // IA-E96-10.arc.gz (special case, election 1996 crawl)

  // Date range:
  // Minimum: These are the very first crawls, so mintimestamp check is not needed
  // Maximum: 19980717230341 (from collection GR-503034-c)

  // Add some extra days to be safe
  const timestampMatch = captureTimestamp && captureTimestamp <= "19980801235959";

  const baseName = filename.split("/").pop() ?? filename;

  const match =
    baseName.match(/^([A-Z]{2})-(\d{6}[A-Z]?)\.arc\.gz$/) ||
    baseName.match(/^(IA-E96)-(\d{2})\.arc\.gz$/) ||
    baseName.match(/^(F2)-(\d{6}[A-Z]?)\.arc\.gz$/);
  if (match) {
    const crawlIdentifier = match[1];
    const serialNumber = match[2];
    const isKnown1996Tag = KNOWN_1996_TAGS.includes(crawlIdentifier);
    const crawlerName = get1996CrawlerNameFromAbbreviation(crawlIdentifier);

    let confidence = 0.5;
    if (isKnown1996Tag) {
      confidence += 0.25;
    }
    if (timestampMatch) {
      confidence += 0.25;
    }

    return {
      confidence,
      filenameType: "alexa-1996",
      recordFormat: "arc",
      details: {
        crawlIdentifier,
        serialNumber,
        crawlerName,
      },
    };
  }
}

const KNOWN_1998_CRAWL_IDENTIFIERS = [
  "green",
  "slash",
  "sarah",
  "to",
  "title_crawl",
  "to-crawl",
  "robots",
  "20000706",
  "20000710",
  "foo",
];

function get1998CrawlerNameFromIdentifier(
  identifier: string,
  runTimestamp: string,
): string | undefined {
  switch (identifier) {
    case "green":
    case "title":
    case "to":
    case "to-crawl":
    case "robots":
      if (runTimestamp >= "20000229") {
        return "crawl1";
      } else {
        return "green";
      }
    case "sarah":
      if (runTimestamp >= "20000229") {
        return "crawl2";
      } else {
        return "sarah";
      }
    default:
      break;
  }
  return undefined;
}

export function parseAlexa1998Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // green-0030-912577479.arc.gz
  // green-0030-19990417120238-924396460.arc.gz
  // green-000281-19990426183238-925282342.arc.gz
  // sarah-000072-19991113205559-942601339.arc.gz
  // slash-913417727.arc.gz
  // slash_19990124232053-917250493.arc.gz
  // to-19990116-916524615.arc.gz
  // to-crawl-000000-20000519142052-958771735.arc.gz
  // title_crawl-916550221.arc.gz
  // foo-910809268.arc.gz
  // 20000706-001257-20000706164701-962932469.arc.gz
  // 20000710-000017-20000711075301-963330128.arc.gz

  // Date range:
  // Minimum: 19980717230341 (from collection GR-503034-c)
  // Maximum: 20000712083935 (from 20000710-000017-20000711075301-963330128-c)

  // Parsing:
  // Must end with an epoch timestamp (preceeded by a dash)
  // Then might have a timestamp as YYYYMMDDhhmmss (in tz America/Los_Angeles) preceeding the epoch timestamp, also preceeded by a dash
  // If a number still remains, it must be the serial. This too is preceeded by a dash
  // Anything that remains is the crawl identifier

  // Add some extra days to be safe
  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "19980701000000" &&
    captureTimestamp <= "20000801235959";

  const baseName = filename.split("/").pop() ?? filename;
  const recordFormat = parseRecordFormatFromArchiveFilename(baseName);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");

  const finalPart = parts.pop() ?? "";
  // this is the timestamp when the ARC file writing started?
  const runTimestamp = parseEpochSecondsFromArchiveFilename(finalPart);
  if (!runTimestamp?.isValid || runTimestamp.year < 1998 || runTimestamp.year > 2000) {
    return undefined;
  }

  let confidence = 0.6;

  const potentialTimestampPart = parts.pop();
  // Early captures are definitely local timestamps, e.g. easlily seen from amazon 1998 crawl
  const batchTimestamp = potentialTimestampPart
    ? DateTime.fromFormat(potentialTimestampPart, "yyyyMMddHHmmss", { zone: "America/Los_Angeles" })
    : undefined;
  if (!batchTimestamp?.isValid || batchTimestamp.year < 1998 || batchTimestamp.year > 2000) {
    // not a timestamp, not all names have one here...
    parts.push(potentialTimestampPart ?? "");
  } else {
    confidence += 0.1;
  }

  let serialNumber = parts.pop();
  const isValidSerial = serialNumber ? /^\d{4,}$/.test(serialNumber) : false;
  if (!isValidSerial) {
    parts.push(serialNumber ?? "");
    serialNumber = undefined;
  } else {
    confidence += 0.1;
  }

  const crawlIdentifier = parts.join("-");

  if (!KNOWN_1998_CRAWL_IDENTIFIERS.includes(crawlIdentifier)) {
    return undefined;
  }

  if (timestampMatch) {
    confidence += 0.2;
  }

  const resultTimestamp = runTimestamp.toUTC().toISO({ suppressMilliseconds: true });

  return {
    confidence,
    filenameType: "alexa-1998",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      batchTimestamp: batchTimestamp?.isValid
        ? batchTimestamp?.toUTC()?.toISO({ suppressMilliseconds: true })
        : undefined,
      startTimestamp: resultTimestamp,
      serialNumber,
      crawlerName: get1998CrawlerNameFromIdentifier(
        crawlIdentifier,
        runTimestamp.toUTC().toFormat("yyyyMMddHHmmss"),
      ),
    },
  };
}

export function parseAlexa200006RecyCrawl(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // Recy20000602aa-960022519.arc.gz
  // Recy20000602ap-961498955.arc.gz

  // Date range:
  // Minimum: 20000603085519 (from Recy20000602aa-960022519-c)
  // Maximum: 20000620110235 (from Recy20000602aa-960022519-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000601000000" &&
    captureTimestamp <= "20000621000000";

  const baseName = filename.split("/").pop() ?? filename;
  const recordFormat = parseRecordFormatFromArchiveFilename(baseName);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const match = baseName.match(/^(Recy20000602)([a-z]{2})-(\d{9})\.arc\.gz$/);
  if (match) {
    const crawlIdentifier = match[1];
    const serialNumber = match[2];
    const finalPart = match[3];
    // this is the timestamp when the ARC file writing started?
    const runTimestamp = parseEpochSecondsFromArchiveFilename(finalPart);
    if (!runTimestamp?.isValid || runTimestamp.year !== 2000) {
      return undefined;
    }
    return {
      confidence: timestampMatch ? 1 : 0.8,
      filenameType: "alexa-2000-06-recy-crawl",
      recordFormat: "arc",
      details: {
        crawlIdentifier,
        startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
        serialNumber,
      },
    };
  } else {
    return undefined;
  }
}

export function parseAlexa200007Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // 20000710.000033-20000712015206-963392503.arc.gz
  // 20000929.000068-20001005011008-970740821.arc.gz
  // 20001024.000228-20001102144308-973205587.arc.gz

  // Date range:
  // Minimum: 20000712000000 (from 20000710-000017-20000711075301-963330128-c)
  // Maximum: 20001104000000 (from 20001024.000211-20001102040308-973170552-c)

  // Parsing:
  // Must end with an epoch timestamp (preceeded by a dash)
  // Then might have a timestamp as YYYYMMDDhhmmss (in tz America/Los_Angeles) preceeding the epoch timestamp, also preceeded by a dash
  // If a number still remains, it must be the serial. This too is preceeded by a dash
  // Anything that remains is the crawl identifier

  // Add some extra days to be safe
  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000701000000" &&
    captureTimestamp <= "20001104000000";

  const baseName = filename.split("/").pop() ?? filename;
  const recordFormat = parseRecordFormatFromArchiveFilename(baseName);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");
  if (parts.length !== 3) {
    return undefined;
  }

  const finalPart = parts.pop() ?? "";
  // this is the timestamp when the ARC file writing started?
  const runTimestamp = parseEpochSecondsFromArchiveFilename(finalPart);
  if (!runTimestamp?.isValid || runTimestamp.year !== 2000) {
    return undefined;
  }

  const timestampPart = parts.pop() ?? "";
  if (timestampPart.length !== 14) {
    return undefined;
  }

  // Early captures are definitely local timestamps
  const batchTimestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", {
    zone: "America/Los_Angeles",
  });
  if (!batchTimestamp?.isValid || batchTimestamp.year !== 2000) {
    return undefined;
  }

  const initialPart = parts.pop() ?? "";
  const [crawlIdentifier, serial] = initialPart.split(".");

  if (crawlIdentifier.length !== 8 || !crawlIdentifier.startsWith("2000")) {
    return undefined;
  }
  if (!serial || !/^\d{6}$/.test(serial)) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2000-07",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      batchTimestamp: batchTimestamp?.isValid
        ? batchTimestamp?.toUTC()?.toISO({ suppressMilliseconds: true })
        : undefined,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      serialNumber: serial,
    },
  };
}

export function parseAlexa200011Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // crc22.20001109160358.arc.gz
  // crc23.20001119004341.arc.gz
  // crc20.20001119121511.arc.gz
  // arc38.20001201173428.arc.gz

  // Date range:
  // Minimum: 20001109160358 (from crc22.20001109155222-c)
  // Maximum: 20010201034444 (from arc45.20010130191240-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20001101000000" &&
    captureTimestamp <= "20010205000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const [prefix, suffix] = baseName.split(".");
  if (!prefix || !suffix) {
    return undefined;
  }
  if (!prefix.match(/^(crc|arc)\d+$/)) {
    return undefined;
  }
  const runTimestamp = DateTime.fromFormat(suffix, "yyyyMMddHHmmss", { zone: "UTC" });
  if (!runTimestamp.isValid || runTimestamp.year < 2000 || runTimestamp.year > 2001) {
    return undefined;
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2000-11",
    recordFormat: "arc",
    details: {
      crawlIdentifier: prefix,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      crawlerName: prefix,
    },
  };
}

export function isValidAlexa200102CrawlerName(name: string): boolean {
  if (name.match(/^arc\d+$/)) {
    return true;
  } else if (name.match(/^crawl\d+$/)) {
    return true;
  } else if (name.match(/^alexa\d+$/)) {
    return true;
  }
  return false;
}

export function parseAlexa200102Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // DD_arc22.20010204140533.arc.gz
  // DD_arc19.20010215035256.arc.gz
  // DE_crawl2.20010413151635.arc.gz
  // DE_arc19.20010413174627.arc.gz
  // NEWS0_crawl3.20011108131420.arc.gz
  // NEWS0_crawl4.20011111054832.arc.gz
  // NEWS0_debug_crawl4.20011127130137.arc.gz
  // DL0_crawl4.20020127014009.arc.gz
  // DH_alexa0.20011120042039.arc.gz
  // DI_alexa2.20011214012057.arc.gz
  // DK_crawl6.20020511001406.arc.gz
  // DK_slash_crawl8.20020324042222.arc.gz
  // DM_crawl13.20020827095722.arc.gz
  // DX_images_crawl30.20040608014709.arc.gz
  // DX_dad_crawl31.20040611073353.arc.gz
  // DZ_binary1_crawl30.20041107074023.arc.gz
  // T_arc26.20010215225722.arc.gz
  // amim_crawl6.20010811125231.arc.gz
  // amazon_crawl6.20010809223155.arc.gz
  // excite_crawl6.20010821144825.arc.gz
  // WWW_RTRS_crawl3.20010911233514.arc.gz
  // AMZN_crawl7.20020530054253.arc.gz

  // Election 2002 special crawls:
  // E02_1h_0371_crawl3.20021118200003.arc.gz
  // E02_1w_08_crawl8.20020808183624.arc.gz
  // E02_1w_25_crawl5.20021202185002.arc.gz
  // E02_24h_140_crawl4.20021118080004.arc.gz
  // E02_once_crawl4.20020914041618.arc.gz

  // Date range:
  // Minimum: 20010204140533 (from DD_arc22.20010204140216-c)
  // Maximum: 20050815083524 (from ED_dad_crawl31.20050813083908-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20010201000000" &&
    captureTimestamp <= "20050830000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const [prefix, suffix] = baseName.split(".");
  if (!prefix || !suffix) {
    return undefined;
  }
  const runTimestamp =
    suffix.length === 14
      ? DateTime.fromFormat(suffix, "yyyyMMddHHmmss", { zone: "UTC" })
      : undefined;
  if (!runTimestamp?.isValid || runTimestamp.year < 2001 || runTimestamp.year > 2005) {
    return undefined;
  }
  const prefixParts = prefix.split("_");
  if (prefixParts.length < 2) {
    return undefined;
  }
  const crawlerName = prefixParts.pop() ?? "";
  if (!isValidAlexa200102CrawlerName(crawlerName)) {
    return undefined;
  }
  const firstPart = prefixParts[0];
  if (firstPart === "E02") {
    const crawlIdentifier = prefixParts.shift();
    const period = prefixParts.shift();
    const serialNumber = prefixParts.shift();
    if (!crawlIdentifier || !period) {
      return undefined;
    }
    let confidence = 0.8;
    if (timestampMatch) {
      confidence += 0.2;
    }
    return {
      confidence,
      filenameType: "alexa-2002-election",
      recordFormat: "arc",
      details: {
        crawlIdentifier,
        crawlPeriod: period,
        serialNumber,
        startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
        crawlerName,
      },
    };
  } else {
    const crawlCounter = firstPart.match(/^D|E[A-Z]\d*$/) ? firstPart : undefined;
    const crawlIdentifier = prefixParts.join("_");
    let confidence = 0.8;
    if (timestampMatch) {
      confidence += 0.2;
    }
    return {
      confidence,
      filenameType: "alexa-2001-05",
      recordFormat: "arc",
      details: {
        crawlIdentifier,
        crawlGeneration: crawlCounter,
        startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
        crawlerName,
      },
    };
  }
}

export function isValidAlexa200508CrawlerName(name: string): boolean {
  if (name.match(/^crawl\d+$/)) {
    return true;
  }
  return false;
}

export function parseAlexa200508Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // EE_1_0_crawl26_.20050816083846.arc.gz
  // EE_dad_4_0_crawl25_.20051004072013.arc.gz
  // EE_images_2_0_crawl28_.20051001132702.arc.gz
  // EF_images_7_0_crawl28_.20051026173146.arc.gz
  // EH_amzn_20_0_crawl24_.20060309070709.arc.gz
  // EI_dad_24_0_crawl22_.20060602213318.arc.gz

  // Date range:
  // Minimum: 20050816013351 (from EE_1_0_crawl22_.20050816013351-c)
  // Maximum: 20060604081804 (from EI_21_0_crawl30_.20060604060031-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20050801000000" &&
    captureTimestamp <= "20060701000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const [prefix, suffix] = baseName.split(".");
  if (!prefix || !suffix) {
    return undefined;
  }
  const runTimestamp =
    suffix.length === 14
      ? DateTime.fromFormat(suffix, "yyyyMMddHHmmss", { zone: "UTC" })
      : undefined;
  if (!runTimestamp?.isValid || runTimestamp.year < 2005 || runTimestamp.year > 2006) {
    return undefined;
  }
  const prefixParts = prefix.split("_");
  if (prefixParts.length < 3) {
    return undefined;
  }
  const finalPart = prefixParts.pop() ?? "";
  // The final part should always be empty (the prefix ends with a _)
  if (finalPart) {
    return undefined;
  }
  const crawlerName = prefixParts.pop() ?? "";
  if (!isValidAlexa200508CrawlerName(crawlerName)) {
    return undefined;
  }

  // Is this always 0???
  const subSequence = prefixParts.pop() ?? "";
  if (subSequence !== "0") {
    return undefined;
  }
  // Some global counter, seems this is incremented for each unique crawl identifier? (e.g. EI_dad, EI_images)
  // Incrmented by 5 each time that crawlCounter is incremented. Counter starts off at 1
  // Relationship:
  // (x - 1) % 5 === 0 -> (no suffix)
  // (x - 1) % 5 === 1 -> "images"
  // (x - 1) % 5 === 2 -> "binary"
  // (x - 1) % 5 === 3 -> "dad"
  // (x - 1) % 5 === 4 -> "amzn"
  const mainSequence = prefixParts.pop() ?? "";
  if (!mainSequence.match(/^\d+$/)) {
    return undefined;
  }

  function getCrawlTypeForSequence(subSequence: number): string | undefined {
    switch ((subSequence - 1) % 5) {
      case 0:
        return undefined;
      case 1:
        return "images";
      case 2:
        return "binary";
      case 3:
        return "dad"; // documents and data?
      case 4:
        return "amzn"; // amazon
    }
  }

  let crawlTypeMatchesNumber = true;
  const expectedCrawlType = getCrawlTypeForSequence(parseInt(mainSequence));
  if (!expectedCrawlType) {
    if (prefixParts.length !== 1) {
      crawlTypeMatchesNumber = false;
    }
  } else if (expectedCrawlType) {
    if (prefixParts.length !== 2) {
      crawlTypeMatchesNumber = false;
    } else {
      if (expectedCrawlType !== prefixParts[1]) {
        crawlTypeMatchesNumber = false;
      }
    }
  }
  if (!crawlTypeMatchesNumber) {
    console.log(
      `Crawl type does not match expected crawl type for sequence number in filename ${filename}`,
    );
  }

  const firstPart = prefixParts[0];
  // TODO: Can we assume all these crawls have this prefix? Are there special crawls?
  const crawlCounter = firstPart.match(/^E[A-Z]\d*$/) ? firstPart : undefined;
  if (!crawlCounter) {
    return undefined;
  }
  const crawlIdentifier = prefixParts.join("_");
  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2005-08",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      crawlGeneration: crawlCounter,
      crawlSequence: mainSequence,
      crawlRun: subSequence,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      crawlerName,
    },
  };
}

export function parseAlexa200606Filename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // 26_0_20060610014940_crawl23.arc.gz
  // 51_78_20200814002231_crawl301.arc.gz
  // 52_19_20110109163559_crawl103_IndexOnly.arc.gz

  // Date range:
  // Minimum: 20060610014940 (from 26_0_20060610014940_crawl23-c)
  // Maximum: 20200814054637 (from alexa20200814-09)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20060601000000" &&
    captureTimestamp <= "20200901000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = baseName.split("_");
  if (parts.length < 4 || parts.length > 5) {
    return undefined;
  }

  let finalPart: string | undefined = parts.pop() ?? "";
  // No idea what this means... But it will be added to the crawl identifier
  // It seems that IndexOnly arcs are smaller than other arcs?
  if (finalPart !== "IndexOnly") {
    parts.push(finalPart);
    finalPart = undefined;
  }
  const crawlerName = parts.pop() ?? "";
  if (!isValidAlexa200508CrawlerName(crawlerName)) {
    return undefined;
  }
  const runTimestampRaw = parts.pop() ?? "";
  const runTimestamp =
    runTimestampRaw.length === 14
      ? DateTime.fromFormat(runTimestampRaw, "yyyyMMddHHmmss", { zone: "UTC" })
      : undefined;
  if (!runTimestamp?.isValid || runTimestamp.year < 2006 || runTimestamp.year > 2020) {
    return undefined;
  }
  const subSequence = parts.pop() ?? "";
  if (!subSequence.match(/^\d+$/)) {
    return undefined;
  }
  // This seems to continue the sequence from the 200508 crawl, but it seems that the distinction between crawl types (images, binary, dad, amzn)
  // is not maintained anymore(?), so we can't infer the crawl type from the sequence number anymore(?)
  const mainSequence = parts.pop() ?? "";
  if (!mainSequence.match(/^\d+$/)) {
    return undefined;
  }
  const crawlIdentifier = [mainSequence, subSequence, finalPart].filter(isDefined).join("_");
  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2005-08",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      crawlSequence: mainSequence,
      crawlRun: subSequence,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      crawlerName,
    },
  };
}

export function parseAlexa200004ImageFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // short1-2-25-957463952.arc.gz
  // short1e-2-25-957710606.arc.gz
  // test1-1-64-956414780.arc.gz
  // test6-0-256-957035892.arc.gz
  // crc14-2-aa-958451168.arc.gz
  // crc14-2-ad-958580776.arc.gz

  // Date range:
  // Minimum: 20000422000000 (from test1-0-32-956362155-c)
  // Maximum: 20000618040641 (from crc24-7-aa-960915931-c)

  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000422000000" &&
    captureTimestamp <= "20000619000000";

  const baseName = filename.split("/").pop() ?? filename;
  const recordFormat = parseRecordFormatFromArchiveFilename(baseName);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");
  if (parts.length !== 4) {
    return undefined;
  }

  const finalPart = parts.pop() ?? "";
  // this is the timestamp when the ARC file writing started?
  const runTimestamp = parseEpochSecondsFromArchiveFilename(finalPart);
  if (!runTimestamp?.isValid || runTimestamp.year !== 2000) {
    return undefined;
  }

  const tuningParameterOrSerial = parts.pop() ?? "";
  // max image size in KB ???
  const tuningParameter = isNaN(parseInt(tuningParameterOrSerial))
    ? undefined
    : parseInt(tuningParameterOrSerial);
  const serialNumber = isNaN(parseInt(tuningParameterOrSerial))
    ? tuningParameterOrSerial
    : undefined;

  const node = parts.pop() ?? "";

  const crawlIdentifier = parts.pop() ?? "";
  const crawlIdentifierPrefix = crawlIdentifier.split(/(\d.*)/)[0];
  if (!["test", "short", "crc"].includes(crawlIdentifierPrefix)) {
    return undefined;
  }
  if (crawlIdentifierPrefix === "crc") {
    if (!serialNumber) {
      return undefined;
    }
  } else {
    if (tuningParameter === undefined) {
      return undefined;
    }
  }

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2000-04-image",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      crawlerName: crawlIdentifierPrefix === "crc" ? crawlIdentifier : undefined,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      serialNumber,
      tuningParameter,
      node,
    },
  };
}

export function parseAlexa200007ImageFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // IMG_AAA_SUBaj-965455500.arc.gz
  // IMG_AAB_SUBaa-964743122.arc.gz
  // IMG_AAR_SUBad-967330605.arc.gz
  // IMG_ABE_SUBae-971359721.arc.gz

  // Date range:
  // Minimum: 20000727224017 (from IMG_AAA_SUBaj-965455412-c)
  // Maximum: 20001012140841 (from IMG_ABD_SUBai-971199393-c)

  // Note: All Alexa crawls start with IMG_A (IMG_X is used by dec, the other ones are not known to exist)
  // So could we assume that A = Alexa, X = from dec pa-x(?). Later web crawls only have two letters for indentifier(?)
  const timestampMatch =
    captureTimestamp &&
    captureTimestamp >= "20000701000000" &&
    captureTimestamp <= "20001015000000";

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? filename);
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const match = baseName.match(/^(IMG_A[A-Za-z]{2}_SUB[a-z]{2})-(\d{9})$/);
  if (!match) {
    return undefined;
  }
  const [crawlBasename, runTimestampStr] = baseName.split("-");
  const runTimestamp = parseEpochSecondsFromArchiveFilename(runTimestampStr);
  if (!runTimestamp?.isValid || runTimestamp.year !== 2000) {
    return undefined;
  }
  const [imgPrefix, mainIdentifier, subIdentifier] = crawlBasename.split("_");
  const crawlIdentifier = `${imgPrefix}_${mainIdentifier[0]}`;
  const crawlCounter = mainIdentifier.slice(1);
  const serialNumber = subIdentifier.slice(3);

  let confidence = 0.8;
  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-2000-07-image",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      crawlGeneration: crawlCounter,
      startTimestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      serialNumber,
    },
  };
}

export function parseAlexaRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [
    parseAlexa1996Filename,
    parseAlexa1998Filename,
    parseAlexa200004ImageFilename,
    parseAlexa200006RecyCrawl,
    parseAlexa200007ImageFilename,
    parseAlexa200007Filename,
    parseAlexa200011Filename,
    parseAlexa200102Filename,
    parseAlexa200508Filename,
    parseAlexa200606Filename,
  ];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const result = parser(filename, captureTimestamp);
    if (result) {
      results.push({ ...result, details: { ...result.details, crawlInfrastructure: "alexa" } });
    }
  }

  return results;
}
