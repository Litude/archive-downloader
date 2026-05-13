import { createWaybackCrawlerHostname } from "./filename-parser-wayback.js";
import {
  cleanUpRecordFilenameCrawlerName,
  cleanUpRecordFilenameResult,
  findRecordNameTimestampPartIndex,
  ParsedRecordFilenameResult,
  parseRecordFormatFromArchiveFilename,
  parseRecordNameTimestamp,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";

/**
 * Formats that need to be parsed:
// these have the crawler name at the end of the collection
WIDE-20130320035939-crawl338/WIDE-20130320075913-02374.warc.gz
SURV-20130521192746-crawl452/SURV-20130521192746-00022.warc.gz
COM-20110305184231-crawl305/COM-20110305195159-00904.warc.gz
WPO-20110514084654-crawl308/WPO-20110514084654-00140.warc.gz
SHAL-20130502044346-crawl454/SHAL-20130502045624-00208.warc.gz
NO404-WP-20140307014410-crawl458/NO404-WP-20140307024219-02746.warc.gz

WIDE-20100917035355838-00011-18463~ia360919.us.archive.org~9443.warc.gz
WIDE-20101109233701833-00242-28285~vmcrawl201.us.archive.org~9443.warc.gz
WIDE-20101121173325020-00211-29733~ia360926.us.archive.org~9443.warc.gz

live-20130108092328900-02995-20130109012809314/live-20130108113109588-03000.arc.gz


TSUNAMI-03-20050118032102-00173-crawling001.archive.org.arc.gz
web_iq080-20060112054548-00182-crawling004.archive.org.arc.gz
BNCF-CRAWL-000-20060510040249-07147-crawling022.arc.gz
BNF-FOCUSEDCRAWL-002-20061116095254-00836-crawling01.us.archive.org.arc.gz
BNF-CRAWL-002-20061124192114-02637-crawling015.us.archive.org.arc.gz
BNF-CRAWL-004-SLASHPAGE-20081107230409-00085-crawling107.us.archive.org.arc.gz
NLA-AU-CRAWL-001-20060820190850-03347-crawling05.us.archive.org.arc.gz
NLA-AU-CRAWL-001-20060823075212-05626-crawling06.us.archive.org.arc.gz
NLA-AU-CRAWL-002-20070901020502-05641-crawling06.us.archive.org.arc.gz
NLA-AU-CRAWL-003-20080722154134-05048-crawling106.us.archive.org.arc.gz
IA-AROUND-THE-WORLD-2007-20070607064211-00914-crawling021.us.archive.org.arc.gz
IA-AROUND-THE-WORLD-2007-STAGE2-20070914020134-23234-crawling20.us.archive.org.arc.gz
IA-AROUND-THE-WORLD-2007-STAGE3-20071019140800-08386-crawling20.us.archive.org.arc.gz
DOTGOV-2008-01-20081012071924-18349-crawling14.us.archive.org.arc.gz
web_sm_or07-20060929055219-00130-crawling021.us.archive.org.arc.gz
web_el_200606-CRAWL-02-20060615025405-00624-ia320022.us.archive.org.arc.gz // election 2006?
web_el_200606-CRAWL-19-20061012032604-00854-crawling02.us.archive.org.arc.gz
web_el_2008-080-20081023010242-00523-crawling015.us.archive.org.arc.gz
web_sm_sing07-20060930184639-00021-crawling021.us.archive.org.arc.gz
web_tran-002-20090217155611-02231-crawling108.us.archive.org.arc.gz

web_tran-012-20090426030007-02867-crawling107.us.archive.org.warc.gz
web_wk-014-20091120215425-01427-crawling110.us.archive.org.warc.gz
GEOCITIES-20091021120302-00474-ia400131.us.archive.org.warc.gz
SWE-CRAWL-001-20100813174637-00571-crawling103.us.archive.org.warc.gz
NLS-CRAWL-001A-03-16-2010-20100409054616-02728-crawling106.us.archive.org.warc.gz
TLA-20091230030825-00000-ia360903.us.archive.org.warc.gz
NOG-20100612194012-00212-ia360934.us.archive.org.warc.gz
EDG-20100612194508-01656-ia360928.us.archive.org.warc.gz


// Unknown if by IA or someone else:
web_osi-01-20100219085311-00860-domU-12-31-39-01-65-B1.compute-1.internal.warc.gz
web_osi-04-20101113054320-00606-ip-10-122-207-99.ec2.internal.warc.gz
web_ma-H1-20110130093623-00761-ip-10-114-125-18.ec2.internal.warc.gz

Internet memory foundation:
EA-TNA-CONTINUITY-09-AUGPATCH1-0303-20080903152815-00029.arc.gz

// Not crawls by wayback, but probably uses the same format:
ACC-20060314170227-01805-c02.ba.accelovation.com.arc.gz
ACC-20060512222330-09631-c04.ba.accelovation.com.arc.gz
ACC-20060926052502-01879-c05.ba.accelovation.com.arc.gz
 */

function _parseGenericRecordFilenameInternal(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  const baseName = filename.split("/").pop() ?? filename;
  const parts = removeFileExtensionFromArchiveFilename(baseName).split("-");

  const timestampPartIndex = findRecordNameTimestampPartIndex(parts, {
    allow8Digits: false,
    allow14Digits: true,
    allow17Digits: true,
  });
  if (timestampPartIndex === -1 || timestampPartIndex < 1) {
    return undefined;
  }
  const timestamp = parseRecordNameTimestamp(parts[timestampPartIndex]);
  const crawlIdentifier = parts.slice(0, timestampPartIndex).join("-");
  const secondLastPart = parts.at(timestampPartIndex + 1);
  const lastPart = parts.slice(timestampPartIndex + 2).join("-");
  if (!secondLastPart || !timestamp || !crawlIdentifier) {
    return undefined;
  }
  let serialNumber: string | undefined = secondLastPart;
  let crawlerName: string | undefined = lastPart;
  // If the last part is missing, the second last part might be either the crawler name or the serial number.
  if (!lastPart) {
    if (/^\d+$/.test(secondLastPart)) {
      crawlerName = undefined;
    } else {
      serialNumber = undefined;
      crawlerName = secondLastPart;
    }
  }
  const crawlerNameInfo = crawlerName ? cleanUpRecordFilenameCrawlerName(crawlerName) : undefined;
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (!recordFormat) {
    return undefined;
  }

  let confidence = 0.4;
  const crawlInfrastructure = detectCrawlInfrastructure(crawlerName ?? "", crawlIdentifier);
  if (crawlInfrastructure) {
    confidence += 0.2;
  }

  if (["internetarchive", "accelovation"].includes(crawlInfrastructure ?? "") && crawlerNameInfo?.crawlerHostname && !crawlerNameInfo.crawlerName) {
    // Crawler name is first part of hostname for ia and accelovation
    crawlerNameInfo.crawlerName = crawlerNameInfo.crawlerHostname.split(".")[0];
  }

  if (crawlInfrastructure === "internetarchive" && crawlerNameInfo?.crawlerName && !crawlerNameInfo.crawlerHostname) {
    crawlerNameInfo.crawlerHostname = createWaybackCrawlerHostname(crawlerNameInfo.crawlerName, timestamp);
  }

  return {
    // This is low confidence since it tries to parse pretty much anything, and more specific parsers should be preferred
    confidence,
    filenameType: "generic",
    recordFormat,
    details: {
      crawlIdentifier,
      fileWriteStartTimestamp: timestamp,
      fileSerialNumber: serialNumber,
      ...crawlerNameInfo,
      crawlProvider: crawlInfrastructure,
    },
  };
}

function parseGenericRecordFilenameInternal(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  const result = _parseGenericRecordFilenameInternal(filename, captureTimestamp);
  if (!result) {
    // Some files seem to mistakenly have two -- instead of one, so we try repairing such names
    return _parseGenericRecordFilenameInternal(filename.replace(/-+/g, '-'), captureTimestamp);
  }
  else {
    return result;
  }
}

function detectCrawlInfrastructure(crawlerName: string, crawlIdentifier: string): string | undefined {
  const fromCrawlerName = detectCrawlInfrastructureFromCrawlerName(crawlerName);
  if (fromCrawlerName) {
    return fromCrawlerName;
  }
  return detectCrawlInfrastructureFromCrawlIdentifier(crawlIdentifier);
}

function detectCrawlInfrastructureFromCrawlerName(crawlerName: string): string | undefined {
  const lower = crawlerName.toLowerCase();
  if (lower.includes("archive.org") || (lower.match(/^crawling\d{2,3}$/)) || lower.match(/^ia\d{5,6}$/)) {
    return "internetarchive";
  } else if (lower.includes("accelovation.com")) {
    return "accelovation";
  }
  return undefined;
}

function detectCrawlInfrastructureFromCrawlIdentifier(crawlIdentifier: string): string | undefined {
  if (crawlIdentifier.startsWith("IA-FOC-")) {
    return "internetarchive";
  }
  return undefined;
}

export function parseGenericRecordFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const result = parseGenericRecordFilenameInternal(filename);
  return result ? [cleanUpRecordFilenameResult(result)] : [];
}

export function parseGenericRecordFilenamePickBest(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  return parseGenericRecordFilename(filename, _captureTimestamp)[0];
}
