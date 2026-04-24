import { DateTime } from "luxon";
import {
  ParsedRecordFilename,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./filename-parser-common.js";

export interface AlexaFilenameDetails {
  crawlIdentifier: string;
  timestamp?: string;
  batchTimestamp?: string;
  serialNumber?: string;
  crawlerName?: string;
}

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
    case "BK": // Brewster Kahle's test crawler(???)
    case "TS": // Test(???)
    case "F2": // Only two arcs, probably some test again (e.g. firestone v2 test?)
    default:
      return undefined;
  }
}

function parseAlexa1996Filename(
  filename: string,
  timestamp?: string,
): ParsedRecordFilename<AlexaFilenameDetails> | undefined {
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
  const timestampMatch = timestamp && timestamp <= "19980801235959";

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
  "20000706",
  "20000710",
];

function get1998CrawlerNameFromIdentifier(
  identifier: string,
  timestamp?: string,
): string | undefined {
  switch (identifier) {
    case "green":
    case "title":
      return "green";
    case "to":
      if (timestamp && timestamp.startsWith("1999")) {
        return "green";
      }
      break;
    case "sarah":
      return "sarah";
    default:
      break;
  }
  return undefined;
}

export function parseAlexa1998Filename(
  filename: string,
  timestamp?: string,
): ParsedRecordFilename<AlexaFilenameDetails> | undefined {
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
    timestamp && timestamp >= "19980701000000" && timestamp <= "20000801235959";

  const baseName = filename.split("/").pop() ?? filename;
  const recordFormat = parseRecordFormatFromArchiveFilename(baseName);
  if (recordFormat !== "arc") {
    return undefined;
  }
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");

  const finalPart = parts.pop() ?? "";
  // this is the timestamp when the ARC file writing started?
  const runTimestamp = DateTime.fromSeconds(+finalPart);
  if (!runTimestamp.isValid || runTimestamp.year < 1998 || runTimestamp.year > 2000) {
    return undefined;
  }

  let confidence = 0.1;

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

  if (KNOWN_1998_CRAWL_IDENTIFIERS.includes(crawlIdentifier)) {
    confidence += 0.5;
  }

  if (timestampMatch) {
    confidence += 0.2;
  }
  return {
    confidence,
    filenameType: "alexa-1998",
    recordFormat: "arc",
    details: {
      crawlIdentifier,
      batchTimestamp: batchTimestamp?.isValid
        ? batchTimestamp?.toUTC()?.toISO({ suppressMilliseconds: true })
        : undefined,
      timestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      serialNumber,
      crawlerName: get1998CrawlerNameFromIdentifier(crawlIdentifier, timestamp),
    },
  };
}

export function parseAlexa200007Filename(
  filename: string,
  timestamp?: string,
): ParsedRecordFilename<AlexaFilenameDetails> | undefined {
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
    timestamp && timestamp >= "20000701000000" && timestamp <= "20001104000000";

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
  const runTimestamp = DateTime.fromSeconds(+finalPart);
  if (!runTimestamp.isValid || runTimestamp.year !== 2000) {
    return undefined;
  }

  const timestampPart = parts.pop() ?? "";
  if (timestampPart.length !== 14) {
    return undefined;
  }

  // Early captures are definitely local timestamps
  const batchTimestamp = DateTime.fromFormat(timestampPart, "yyyyMMddHHmmss", { zone: "America/Los_Angeles" });
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
      timestamp: runTimestamp.toUTC().toISO({ suppressMilliseconds: true }),
      serialNumber: serial,
    },
  };
}

export function parseAlexaRecordFilename(
  filename: string,
  timestamp?: string,
): ParsedRecordFilename<AlexaFilenameDetails>[] {
  const parsers = [parseAlexa1996Filename, parseAlexa1998Filename, parseAlexa200007Filename];

  const results: ParsedRecordFilename<AlexaFilenameDetails>[] = [];
  for (const parser of parsers) {
    const result = parser(filename, timestamp);
    if (result) {
      results.push(result);
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// return results;

// if (timestamp < "19980709") {
//   // Matches names such as:
//   // GR-034747.arc.gz
//   // FS-195519.arc.gz
//   // IA-000150X.arc.gz
//   const oldNameMatch = baseName.match(/^([A-Z]{2})-(\d{6}[A-Z])$/);
//   if (oldNameMatch) {
//     const crawlIdentifier = oldNameMatch[1];
//     const serialNumber = oldNameMatch[2];
//     const crawlerName = getCrawlerNameFromAbbreviation(crawlIdentifier);
//     return {
//       crawlIdentifier,
//       timestamp,
//       serialNumber,
//       crawlerName,
//       recordFormat: "arc" as const,
//     };
//   }
// }
// if (timestamp < "19981208") {
//   // Matches names such as:
//   // green-0127-912881100.arc.gz
//   const parts = baseName.split("-");
//   if (parts.length === 3) {
//     const crawlerName = parts[0];
//     const serialNumber = parts[1];
//     const timestamp = DateTime.fromSeconds(+parts[2]).toISO({ suppressMilliseconds: true });
//     return {
//       crawlIdentifier: crawlerName,
//       timestamp,
//       serialNumber,
//       crawlerName,
//       recordFormat: "arc" as const,
//     };
//   }
// }

// // Try to parse names such as:
// // DG_crawl5.20010820185613.arc.gz
// // EF_dad_9_0_crawl28_.20051102083259.arc.gz
// if (
//   [...baseName].filter((c) => c === ".").length === 1 &&
//   findTimestampPartIndex(baseName.split("."), { allow14Digits: true }) === 1
// ) {
//   const [crawlIdentifier, timestamp] = baseName.split(".");
//   if (crawlIdentifier && timestamp) {
//     return { timestamp, crawlIdentifier };
//   }
// }

// // Try to parse names such as:
// // green-0157-19990218235953-919580111.arc.gz
// const parts = baseName.split("-");
// if (parts.length === 4) {
//   const timestampPartIndex = findTimestampPartIndex(parts, { allow14Digits: true });
//   if (timestampPartIndex === 2) {
//     const crawlStartTime = DateTime.fromSeconds(+parts[3]);
//     // TODO: Should we pass the capture date as parameter to allow more flexible validation of the timestamp part
//     if (crawlStartTime.isValid && crawlStartTime.year >= 1990 && crawlStartTime.year <= 2030) {
//       return {
//         timestamp: crawlStartTime.toFormat("yyyyMMddHHmmss"),
//         batchTimestamp: parts[2],
//         crawlIdentifier: `${parts[0]}-${parts[1]}`,
//       };
//     }
//   }
// }
//}
