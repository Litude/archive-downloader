import { parseGenericRecordFilenamePickBest } from "./filename-parser-generic.js";
import {
  cleanUpRecordFilenameResult,
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
  // portuguese-web-archive-EAWP6-2014-0416/IAH-20141129224655-41604-p12.arquivo.pt.arc.gz

  if (!filename.startsWith("portuguese-web-archive")) {
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
    filenameType: "arquivo-pt",
    recordFormat: preliminaryResult.recordFormat,
    details: {
      ...preliminaryResult.details,
      crawlProvider: "arquivo-pt",
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
  // INA-HISTORICAL-2006-GROUP-DAE-20100812000000-00003.arc.gz

  const baseName = filename.split("/").pop() ?? filename;
  if (!baseName.startsWith("INA-HISTORICAL-")) {
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
  const parts = filename.split("-");
  const yearPart = parts.find((part) => /^(1|2)\d{3}$/.test(part));

  if (!preliminaryResult.details.crawlIdentifier.startsWith("INA-HISTORICAL-")) {
    return undefined;
  }

  return {
    confidence: 1,
    filenameType: "ina-historical",
    recordFormat,
    details: {
      ...preliminaryResult.details,
      fileWriteStartTimestamp: undefined,
      crawlProcessingTimestamp: preliminaryResult.details.fileWriteStartTimestamp,
      crawlYear: yearPart,
      // All evidence points to these being capture by alexa infrastructure
      crawlProvider: "alexa",
    },
  };
}

function parseCdlRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches filenames like:
  // CDL-20081105235100-00001-vat01.cdlib.org.arc.gz
  // CDL-20090120071925-01353-dp01.warc.gz
  // CDL-20090120082528-00008-vat01.cdlib.org.warc.gz

  const baseName = filename.split("/").pop() ?? filename;
  if (!baseName.startsWith("CDL-")) {
    return undefined;
  }
  const preliminaryResult = parseGenericRecordFilenamePickBest(filename, captureTimestamp);
  if (!preliminaryResult) {
    return undefined;
  }
  const timestamp = preliminaryResult.details.fileWriteStartTimestamp;
  if (!timestamp || (!timestamp.startsWith("2008") && !timestamp.startsWith("2009"))) {
    return undefined;
  }

  return {
    confidence: 1,
    filenameType: "cdl",
    recordFormat: preliminaryResult.recordFormat,
    details: {
      ...preliminaryResult.details,
      crawlProvider: "cdl",
    },
  };
}

export function parseSpecializedRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [
    parsePortugueseWebArchiveRecordFilename,
    parseInaRecordFilename,
    parseCdlRecordFilename,
  ];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const parsed = parser(filename, captureTimestamp);
    if (parsed) {
      results.push(parsed);
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results.map(cleanUpRecordFilenameResult);
}
