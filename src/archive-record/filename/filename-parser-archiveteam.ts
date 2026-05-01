import { DateTime } from "luxon";
import {
  ParsedRecordFilenameResult,
  parseEpochSecondsFromArchiveFilename,
  parseRecordFormatFromArchiveFilename,
  removeFileExtensionFromArchiveFilename,
} from "./record-filename-common.js";

function parseArchiveTeamGoPackFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // archiveteam_archivebot_go_150/www.vogons.org-inf-20140904-173605-a5vcy-00004.warc.gz
  // archiveteam_archivebot_go_086/www.betaarchive.com-inf-20140722-205053-7yz28-00013.warc.gz
  // archiveteam_archivebot_go_20141206160004/pcgamingwiki.com-inf-20141205-041914-89hy7-00002.warc.gz
  // archiveteam_archivebot_go_097/lists.webkit.org-inf-20140725-074726-6j0tk-aborted-00001.warc.gz

  if (!filename.startsWith("archiveteam_archivebot_go_")) {
    return undefined;
  }

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const parts = baseName.split("-");

  const serialNumber = parts.pop();
  if (!serialNumber?.match(/^\d+$/)) {
    return undefined;
  }

  const flags: string[] = [];
  const abortedTag = parts.pop();
  if (abortedTag !== "aborted") {
    parts.push(abortedTag ?? "");
  } else {
    flags.push("aborted");
  }
  const jobIdentifier = parts.pop();
  const time = parts.pop();
  if (!time?.match(/^\d{6}$/)) {
    return undefined;
  }
  const date = parts.pop();
  if (!date?.match(/^\d{8}$/)) {
    return undefined;
  }

  const startTimestamp = DateTime.fromFormat(date + time, "yyyyMMddHHmmss", { zone: "UTC" });
  if (!startTimestamp.isValid) {
    return undefined;
  }

  const crawlDepth = parts.pop();
  const crawlIdentifier = parts.join("-");

  return {
    confidence: 1.0,
    filenameType: "archiveteam-go-pack",
    recordFormat,
    details: {
      crawlIdentifier,
      crawlDepth,
      startTimestamp: startTimestamp.toISO({ suppressMilliseconds: true }),
      jobId: jobIdentifier,
      serialNumber,
      flags: flags.length > 0 ? flags : undefined,
    },
  };
}

function parseArchiveTeamWarriorRecordFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // archiveteam_wiki_20160101022549/wiki_20160101022549.megawarc.warc.gz
  // archiveteam_newssites_20180720203738/newssites_20180720203738.megawarc.warc.gz
  // archiveteam_youtube_20210718133206_83f57141/youtube_20210718133206_83f57141.megawarc.warc.gz
  // archiveteam_urls_20250325135600_32e487b4/urls_20250325135600_32e487b4.1740024026.megawarc.warc.zst

  if (!filename.startsWith("archiveteam_") || filename.startsWith("archiveteam_archivebot_go_")) {
    return undefined;
  }
  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const mainParts = baseName.split(".");

  const megawarcPart = mainParts.pop();
  if (megawarcPart !== "megawarc") {
    return undefined;
  }
  const potentialTimestamp = mainParts.pop();
  const dateTime = parseEpochSecondsFromArchiveFilename(potentialTimestamp ?? "");
  if (!dateTime) {
    mainParts.push(potentialTimestamp ?? "");
  }
  if (mainParts.length !== 1) {
    return undefined;
  }
  const subParts = mainParts[0].split("_");
  if (subParts.length < 2) {
    return undefined;
  }
  let jobHash: string | undefined = subParts.pop();
  if (jobHash?.length !== 8 || !/^[a-f0-9]+$/.test(jobHash)) {
    subParts.push(jobHash ?? "");
    jobHash = undefined;
  }
  const processingTimestampRaw = subParts.pop();
  const processingTimestamp = DateTime.fromFormat(processingTimestampRaw ?? "", "yyyyMMddHHmmss", {
    zone: "UTC",
  });

  if (!processingTimestamp.isValid) {
    return undefined;
  }
  const crawlIdentifier = subParts.join("_");
  return {
    confidence: 1.0,
    filenameType: "archiveteam-warrior",
    recordFormat,
    details: {
      crawlIdentifier,
      startTimestamp: dateTime?.toISO({ suppressMilliseconds: true }),
      processedTimestamp: processingTimestamp.toISO({ suppressMilliseconds: true }),
      jobId: jobHash,
    },
  };
}

function parseArchiveTeamEarlyWarcRecordFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult | undefined {
  // Matches names such as:
  // warc-planearium.de/planearium.de-2015-12-08-d41890d3-00000.warc.gz
  // warc-tidbits.com-static-html/tidbits.com-static-html-2015-12-22-7ce54ea4-00000.warc.gz
  // warc-pics.reiliberationparade.com.ar/pics.reiliberationparade.com.ar-2015-12-17-3f68ac80-00000.warc.gz

  if (!filename.startsWith("warc-")) {
    return undefined;
  }

  const recordFormat = parseRecordFormatFromArchiveFilename(filename);
  if (recordFormat !== "warc") {
    return undefined;
  }

  const baseName = removeFileExtensionFromArchiveFilename(filename.split("/").pop() ?? "");
  const parts = baseName.split("-");

  const serialNumber = parts.pop();
  if (!serialNumber?.match(/^\d+$/)) {
    return undefined;
  }

  const jobHash = parts.pop();
  if (!jobHash?.match(/^[a-f0-9]{8}$/)) {
    return undefined;
  }
  const dayPart = parts.pop();
  if (!dayPart?.match(/^\d{2}$/)) {
    return undefined;
  }
  const monthPart = parts.pop();
  if (!monthPart?.match(/^\d{2}$/)) {
    return undefined;
  }
  const yearPart = parts.pop();
  if (!yearPart?.match(/^\d{4}$/)) {
    return undefined;
  }
  const crawlIdentifier = parts.join("-");

  const startTimestamp = DateTime.fromFormat(
    `${yearPart}-${monthPart}-${dayPart}`,
    "yyyy-MM-dd",
    { zone: "UTC" },
  );
  if (!startTimestamp.isValid) {
    return undefined;
  }

  return {
    confidence: 1.0,
    filenameType: "archiveteam-early-warc",
    recordFormat,
    details: {
      crawlIdentifier,
      startTimestamp: startTimestamp.toFormat("yyyy-MM-dd"),
      jobId: jobHash,
      serialNumber,
    },
  };
}

export function parseArchiveTeamRecordFilename(
  filename: string,
  _captureTimestamp?: string,
): ParsedRecordFilenameResult[] {
  const parsers = [parseArchiveTeamGoPackFilename, parseArchiveTeamWarriorRecordFilename, parseArchiveTeamEarlyWarcRecordFilename];

  const results: ParsedRecordFilenameResult[] = [];
  for (const parser of parsers) {
    const result = parser(filename, _captureTimestamp);
    if (result) {
      results.push({ ...result, details: { ...result.details, crawlInfrastructure: "archiveteam" } });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}
