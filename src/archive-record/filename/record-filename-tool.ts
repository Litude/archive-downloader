import fs from "fs";
import path from "path";
import { parse as csvParse } from "csv-parse/sync";
import { createObjectCsvWriter } from "csv-writer";
import { parseRecordFilenameWithCandidates } from "./record-filename-parser.js";
import { writeCsvRecordsSafe } from "../../utils/file-write.js";

interface FilenameSummaryRow {
  capture_ts: string;
  archive_filename: string;
  filename_crawl_id: string;
  filename_type: string;
  filename_confidence: number;
}

const FILENAME_SUMMARY_HEADER: (keyof FilenameSummaryRow)[] = [
  "capture_ts",
  "archive_filename",
  "filename_crawl_id",
  "filename_type",
  "filename_confidence",
];

async function processCsvFile(csvPath: string, outputDir: string): Promise<void> {
  const content = fs.readFileSync(csvPath, "utf-8");
  const records = csvParse<{ archive_filename: string; capture_ts?: string }>(content, {
    columns: true,
  });

  if (records.length === 0) {
    console.error("CSV file has no data rows");
    process.exit(1);
  }

  if (!("archive_filename" in records[0])) {
    console.error("CSV file missing required column: archive_filename");
    process.exit(1);
  }

  const summaryRows: FilenameSummaryRow[] = records.filter((record) => record.archive_filename).map((record) => {
    const archiveFilename = record.archive_filename ?? "";
    const captureTs = record.capture_ts ?? "";

    const results = parseRecordFilenameWithCandidates(archiveFilename, captureTs || undefined);
    const best = results[0];

    return {
      capture_ts: captureTs,
      archive_filename: archiveFilename,
      filename_crawl_id: best?.details.crawlIdentifier ?? "",
      filename_type: best?.filenameType ?? "",
      filename_confidence: best?.confidence ?? 0,
    };
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "filename_summary.csv");
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: FILENAME_SUMMARY_HEADER.map((key) => ({ id: key, title: key })),
  });
  await writeCsvRecordsSafe(csvWriter, summaryRows);
  console.log(`Filename summary written to ${outputPath}`);
}

async function main(argv: string[]) {
  if (argv.length < 3) {
    console.error(
      "Usage: tsx record-filename-tool.ts <filename|csv-path> [captureTimestamp YYYYMMDDhhmmss]",
    );
    process.exit(1);
  }

  const filename = argv[2];

  if (filename.toLowerCase().endsWith(".csv")) {
    await processCsvFile(filename, "output");
  }
  else {
    const timestamp = argv[3];
    const result = parseRecordFilenameWithCandidates(filename, timestamp);
    console.log(result);
  }

}

main(process.argv);
