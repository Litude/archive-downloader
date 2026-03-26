import fs from "fs";
import path from "path";
import { CaptureEntry } from "../types/capture-types.js";
import { createObjectCsvWriter } from "csv-writer";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";

interface SummaryRow {
  capture_ts: string;
  capture_index?: number;
  modification_ts: string;
  capture_sha256?: string;
  output_sha256?: string;
  output_index?: number;
  url: string;
  statuscode?: number;
  classification: string;
  mimetype: string;
  wayback_digest?: string;
  actual_digest?: string;
  archive_filename?: string;
  archive_length?: number;
  archive_offset?: number;
  archive_source?: string;
}

export async function writeCsvSummary(
  captureEntries: CaptureEntry[],
  filename: Filename,
  outputDirectory: string,
) {
  const summaryRows: SummaryRow[] = captureEntries.map((entry) => ({
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
    classification: entry.classification.type,
    mimetype: entry.mimetype,
    archive_source: entry.cdxEntry.source,
    additional_sources: entry.additionalSources
      ? entry.additionalSources.map((source) => source.source).join(";")
      : undefined,
    archive_digest: entry.cdxEntry.digest,
    actual_digest: entry.actualDigest,
    archive_filename: entry.cdxEntry.filename,
    archive_offset: entry.cdxEntry.offset,
    archive_length: entry.cdxEntry.length,
  }));

  // Output sha256 column is only written if any files were post-processed/modified
  if (summaryRows.every((row) => !row.output_sha256)) {
    summaryRows.forEach((row) => {
      delete row.output_sha256;
    });
  }

  // Only write separate column for output sha256 if any captures have been modified
  if (summaryRows.every((row) => row.capture_sha256 === row.output_sha256)) {
    summaryRows.forEach((row) => {
      delete row.output_sha256;
    });
  }

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
    await csvWriter.writeRecords(summaryRows);
    console.log(`Summary written to ${csvPath}`);
  }
}
