import fs from "fs";
import path from "path";
import { CaptureEntry } from "../types/capture-types.js";
import { createObjectCsvWriter } from "csv-writer";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { isDefined } from "../utils/ts-utils.js";
import { writeCsvRecordsSafe } from "../utils/file-write.js";

const ARRAY_SEPARATOR = "|";

interface SummaryRow {
  capture_ts: string;
  capture_index?: number;
  modification_ts: string;
  capture_sha256?: string;
  output_sha256?: string;
  output_index?: number;
  url: string;
  statuscode?: number;
  corrections?: string;
  classification: string;
  mimetype: string;
  provider?: string;
  additional_providers?: string;
  record_digest?: string;
  actual_digest?: string;
  archive_filename?: string;
  record_available?: boolean;
  record_offset?: number;
  record_length?: number;
}

function mapCorrectionFieldName(field: string): string | undefined {
  switch (field) {
    case "captureTime":
      return "capture_ts";
    case "url":
      return "url";
    default:
      return undefined;
  }
}

export async function writeCsvSummary(
  captureEntries: CaptureEntry[],
  filename: Filename,
  outputDirectory: string,
  { noDeduplication = false }: { noDeduplication?: boolean } = {},
) {
  const summaryRows: SummaryRow[] = captureEntries.map((entry) => {
    const row: SummaryRow = {
      capture_ts: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
      capture_index: entry.captureIndex ?? 0,
      modification_ts: entry.lastModified
        ? entry.lastModified.toISO({ suppressMilliseconds: true })
        : "",
      capture_sha256: entry.originalSha256 ?? entry.sha256,
      output_sha256: entry.sha256,
      output_index: entry.contentIndex === null ? undefined : entry.contentIndex,
      url: entry.url,
      statuscode: entry.statusCode,
      corrections:
        entry.corrections
          ?.map((correction) => mapCorrectionFieldName(correction.field))
          ?.filter(isDefined)
          .sort()
          .join(ARRAY_SEPARATOR) ?? "",
      classification: entry.classification.type,
      mimetype: entry.mimetype,
      provider: entry.cdxEntry.source,
      additional_providers: entry.additionalSources
        ? entry.additionalSources
            .map((source) => source.source)
            .sort()
            .join(ARRAY_SEPARATOR)
        : undefined,
      record_digest: entry.cdxEntry.digest,
      actual_digest: entry.actualDigest,
      archive_filename: entry.cdxEntry.filename,
      record_available: Boolean(
        entry.records?.find((r) => ["warc", "arc"].includes(r.type))?.type ?? undefined,
      ),
      record_offset: entry.cdxEntry.offset,
      record_length: entry.cdxEntry.length,
    };
    if (noDeduplication) {
      delete row.output_index;
    }
    return row;
  });

  if (summaryRows.length > 0) {
    const archivalDir = path.join(outputDirectory, ".archivaldata");
    fs.mkdirSync(archivalDir, { recursive: true });
    const csvPath = path.join(
      archivalDir,
      `${filenameToString(filename, "simple")}.archivaldata.csv`,
    );
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: Object.keys(summaryRows[0]).map((key) => ({ id: key, title: key })),
    });
    await writeCsvRecordsSafe(csvWriter, summaryRows);
    console.log(`Summary written to ${csvPath}`);
  }
}
