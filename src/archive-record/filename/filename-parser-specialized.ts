import { parseGenericRecordFilenamePickBest } from "./filename-parser-generic.js";
import {
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
} from "./record-filename-common.js";

function parsePortugueseWebArchiveRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches filenames like:
  // portuguese-web-archive-AWP12008-20080304234624/IAH-20080305054352-18684-T1.arc.gz
  // portuguese-web-archive-AWP32008-150/IAH-20081024170115-13003-T1.arc.gz
  // portuguese-web-archive-AWP52009-159/IAH-20091001170322-05213-p5.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP62009-106/IAH-20091223000913-05067-p2.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP72010-46/IAH-20100529163933-04191-p12.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP72010-82/IAH-20100601021344-09503-p12.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP102011-68/IAH-20110527192426-06267-p12.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP122011-225/IAH-20120127110856-07308-p12.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP162014-159/IAH-20140911111135-13686-p12.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP232017-471/IAH-20170222031632-37462-p81.arquivo.pt.arc.gz
  // portuguese-web-archive-AWP36-2020-0454/WEB-20210305041226493-p101.arquivo.pt.warc.gz

  if (!filename.startsWith("portuguese-web-archive-AWP")) {
    return undefined;
  }

  const preliminaryResult = parseGenericRecordFilenamePickBest(filename, captureTimestamp);
  if (!preliminaryResult) {
    return undefined;
  }
  if (preliminaryResult.details.crawlIdentifier !== "IAH") {
    return undefined;
  }
  const collectionTail = filename.split("/")[0].slice("portuguese-web-archive-".length);
  let actualIdentifier = collectionTail.split("-")[0];
  // the identifier may or may not include the year. If it does, we want to remove it.
  if (actualIdentifier.length >= 8 && /^2\d{3}$/.test(actualIdentifier.slice(-4))) {
    actualIdentifier = actualIdentifier.slice(0, -4);
  }

  return {
    confidence: 1,
    filenameType: "portuguese-web-archive",
    recordFormat: preliminaryResult.recordFormat,
    details: {
      ...preliminaryResult.details,
      crawlInfrastructure: "arquivo.pt",
      crawlIdentifier: actualIdentifier,
    },
  };
}

function parseInaRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches filenames like:
  // INA-HISTORICAL-EMBEDS-2001-GROUP-ADU-20100812000000-00000.arc.gz
  // INA-HISTORICAL-EMBEDS-2001-GROUP-AHB-20100812000000-00000.arc.gz
  // INA-HISTORICAL-EMBEDS-2002-GROUP-ABI-20100812000000-00000.arc.gz
  // INA-HISTORICAL-EMBEDS-2004-GROUP-AAX-20100812000000-00000.arc.gz
  // INA-HISTORICAL-EMBEDS-2006-GROUP-ALG-20100812000000-00001.arc.gz
  // INA-HISTORICAL-EMBEDS-2008-GROUP-ANY-20100812000000-00000.arc.gz
  // INA-HISTORICAL-EMBEDS-2009-GROUP-AAC-20100812000000-00000.arc.gz
  if (!filename.startsWith("INA-HISTORICAL-EMBEDS-")) {
    return undefined;
  }

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "arc") {
    return undefined;
  }

  const preliminaryResult = parseGenericRecordFilenamePickBest(filename, captureTimestamp);
  if (!preliminaryResult) {
    return undefined;
  }

  if (!preliminaryResult.details.crawlIdentifier.startsWith("INA-HISTORICAL-EMBEDS-")) {
    return undefined;
  }

  return {
    confidence: 1,
    filenameType: "ina-historical-embeds",
    recordFormat,
    details: {
      ...preliminaryResult.details,
      startTimestamp: undefined,
      processedTimestamp: preliminaryResult.details.startTimestamp,
      // All evidence points to these being capture by alexa infrastructure
      crawlInfrastructure: "alexa",
    },
  };
}

export function parseSpecializedRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [parsePortugueseWebArchiveRecordFilename, parseInaRecordFilename];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const parsed = parser(filename, captureTimestamp);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}
