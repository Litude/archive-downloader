import { parseAlexaRecordFilename } from "./filename-parser-alexa.js";
import { parseArchiveItRecordFilename } from "./filename-parser-archiveit.js";
import { parseArchiveTeamRecordFilename } from "./filename-parser-archiveteam.js";
import { parseCommonCrawlFilename } from "./filename-parser-commoncrawl.js";
import { parseCompaqSrcRecordFilename } from "./filename-parser-compaqsrc.js";
import { parseGenericRecordFilename } from "./filename-parser-generic.js";
import { parseSpecializedRecordFilename } from "./filename-parser-specialized.js";
import { parseWaybackRecordFilename } from "./filename-parser-wayback.js";
import { ParsedRecordFilenameResult } from "./record-filename-common.js";

export function parseRecordFilenameWithCandidates(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  if (!filename) {
    return [];
  }

  const parsers = [
    parseAlexaRecordFilename,
    parseCompaqSrcRecordFilename,
    parseCommonCrawlFilename,
    parseGenericRecordFilename,
    parseWaybackRecordFilename,
    parseSpecializedRecordFilename,
    parseArchiveTeamRecordFilename,
    parseArchiveItRecordFilename,
  ];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const result = parser(filename, captureTimestamp);
    if (result) {
      results.push(...result);
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

export function parseRecordFilename(
  filename: string,
  captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  const candidates = parseRecordFilenameWithCandidates(filename, captureTimestamp);
  return candidates[0];
}
