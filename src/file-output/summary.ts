import fs from "fs"
import path from "path";
import { CaptureEntry } from "../types/capture-types";
import { createObjectCsvWriter } from "csv-writer";
import { Filename } from "../types/download-input-types";
import { filenameToString } from "../file-name/file-name";

interface SummaryRow {
    capture_ts: string;
    modification_ts: string;
    capture_sha256?: string;
    output_sha256?: string;
    url: string;
    statuscode: string;
    classification: string;
    mimetype: string;
    wayback_digest?: string;
    actual_digest?: string;
    archive_filename?: string;
    archive_length?: number;
    archive_offset?: number;
    archive_source?: string;
}

export async function writeCsvSummary(captureEntries: CaptureEntry[], filename: Filename, outputDirectory: string) {
    const summaryRows: SummaryRow[] = captureEntries.map(entry => ({
        capture_ts: entry.captureTimestamp.toISO({ suppressMilliseconds: true }),
        modification_ts: entry.lastModified ? entry.lastModified.toISO({ suppressMilliseconds: true }) : '',
        capture_sha256: entry.originalSha256 ?? entry.sha256,
        output_sha256: entry.sha256,
        url: entry.url,
        statuscode: entry.statusCode,
        classification: entry.classification,
        mimetype: entry.mimetype,
        archive_source: entry.archiveSource,
        archive_digest: entry.archiveDigest,
        actual_digest: entry.actualDigest,
        archive_filename: entry.archiveFilename,
        archive_offset: entry.archiveOffset,
        archive_length: entry.archiveLength
    }));

    // Output sha256 column is only written if any files were post-processed/modified
    if (summaryRows.every(row => !row.output_sha256)) {
        summaryRows.forEach(row => { delete row.output_sha256; });
    }

    // Only write separate column for output sha256 if any captures have been modified
    if (summaryRows.every(row => row.capture_sha256 === row.output_sha256)) {
        summaryRows.forEach(row => { delete row.output_sha256; });
    }

    if (summaryRows.length > 0) {
        const archivalDir = path.join(outputDirectory, '.archivaldata');
        fs.mkdirSync(archivalDir, { recursive: true });
        const csvPath = path.join(archivalDir, `${filenameToString(filename, 'simple')}.archivaldata.csv`);
        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: Object.keys(summaryRows[0]).map(key => ({ id: key, title: key })),
        });
        await csvWriter.writeRecords(summaryRows);
        console.log(`Summary written to ${csvPath}`);
    }

}
