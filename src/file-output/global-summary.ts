import fs from "fs";
import path from "path";
import { CaptureEntry } from "../types/capture-types.js";
import { createObjectCsvWriter } from "csv-writer";
import { Filename } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { writeCsvRecordsSafe } from "../utils/file-write.js";

interface GlobalSummaryRow {
  path: string;
  capture_ts: string;
  capture_index: number;
  modification_ts: string;
  output_sha256: string;
  url: string;
  statuscode: string;
  classification: string;
  mimetype: string;
  provider: string;
  archive_filename: string;
  record_available: string;
}

const GLOBAL_SUMMARY_HEADER: (keyof GlobalSummaryRow)[] = [
  "path",
  "capture_ts",
  "capture_index",
  "modification_ts",
  "output_sha256",
  "url",
  "statuscode",
  "classification",
  "mimetype",
  "provider",
  "archive_filename", // gives a clue about the source collection and also the archive format
  "record_available",
];

/**
 * Parse a single CSV line that was written by csv-writer.
 * Handles double-quote escaping and quoted fields containing commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      if (line[i] === ",") {
        i++;
      } // skip comma separator
    } else {
      // Unquoted field
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

function parseExistingCsv(csvPath: string): GlobalSummaryRow[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return [];
  } // only header or empty

  const rows: GlobalSummaryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length !== GLOBAL_SUMMARY_HEADER.length) {
      continue;
    }
    const row = {} as GlobalSummaryRow;
    GLOBAL_SUMMARY_HEADER.forEach((key, idx) => {
      if (key === "capture_index") {
        (row[key] as number) = Number(fields[idx]);
      } else {
        (row[key] as string) = fields[idx];
      }
    });
    rows.push(row);
  }
  return rows;
}

function compareRows(a: GlobalSummaryRow, b: GlobalSummaryRow): number {
  const pathCmp = a.path.localeCompare(b.path);
  if (pathCmp !== 0) {
    return pathCmp;
  }
  const tsCmp = a.capture_ts.localeCompare(b.capture_ts);
  if (tsCmp !== 0) {
    return tsCmp;
  }
  return a.capture_index - b.capture_index;
}

export async function writeGlobalSummary(
  captureEntries: CaptureEntry[],
  filename: Filename,
  outputDirectory: string,
  rootOutputDirectory: string,
): Promise<void> {
  // Compute the file path relative to root, using forward slashes for consistency
  const absoluteFilePath = path.join(outputDirectory, filenameToString(filename, "simple"));
  const filePath = path.relative(rootOutputDirectory, absoluteFilePath).replace(/\\/g, "/");

  const newRows: GlobalSummaryRow[] = captureEntries.map(
    (entry) =>
      ({
        path: filePath,
        capture_ts: entry.captureTimestamp.toISO({ suppressMilliseconds: true }) ?? "",
        capture_index: entry.captureIndex ?? 0,
        modification_ts: entry.lastModified
          ? (entry.lastModified.toISO({ suppressMilliseconds: true }) ?? "")
          : "",
        output_sha256: entry.sha256 ?? "",
        url: entry.url,
        statuscode: entry.statusCode !== undefined ? String(entry.statusCode) : "",
        classification: entry.classification.type,
        mimetype: entry.mimetype,
        provider: entry.cdxEntry.source ?? "",
        archive_filename: entry.cdxEntry.filename ?? "",
        record_available: String(
          Boolean(entry.records?.find((r) => ["warc", "arc"].includes(r.type))?.type ?? undefined),
        ),
      }) satisfies GlobalSummaryRow,
  );

  const archivalDir = path.join(rootOutputDirectory, ".archivaldata");
  fs.mkdirSync(archivalDir, { recursive: true });
  const csvPath = path.join(archivalDir, "summary.csv");

  let existingRows: GlobalSummaryRow[] = [];
  if (fs.existsSync(csvPath)) {
    existingRows = parseExistingCsv(csvPath);
  }

  const filteredRows = existingRows.filter((row) => row.path !== filePath);
  const allRows = [...filteredRows, ...newRows].sort(compareRows);

  if (allRows.length === 0) {
    return;
  }

  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: GLOBAL_SUMMARY_HEADER.map((key) => ({ id: key, title: key })),
  });
  await writeCsvRecordsSafe(csvWriter, allRows);
  console.log(`Global summary updated at ${csvPath}`);
}
