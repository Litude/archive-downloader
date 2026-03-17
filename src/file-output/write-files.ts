import fs from "fs";
import path from "path";
import { CaptureEntry } from "../types/capture-types";
import { Filename } from "../types/download-input-types";
import { filenameToString, getOriginalQueryString } from "../file-name/file-name";

export function writeUniqueFileEntries(captureEntries: CaptureEntry[], filename: Filename, outputDirectory: string) {
    // For each unique sha256 + modify timestamp combination, write the file to disk
    // However if there is a sha256 entry that has a modify timestamp, we DO NOT write the no-timestamp version
    const uniqueEntries = new Map<string, CaptureEntry>();
    const shaHasModified = new Set<string>();

    // First pass: identify which sha256 have modified timestamps
    captureEntries.forEach(entry => {
        if (entry.lastModified && entry.sha256) {
            shaHasModified.add(entry.sha256);
        }
    });

    // Second pass: collect unique entries, skipping no-modify ones if a modified exists
    captureEntries.forEach(entry => {
        if (!entry.lastModified && entry.sha256 && shaHasModified.has(entry.sha256)) {
            return; // skip this entry
        }
        const key = `${entry.sha256}-${entry.lastModified ? entry.lastModified.toISO() : 'no-modified'}`;
        if (!uniqueEntries.has(key)) {
            uniqueEntries.set(key, entry);
        }
    });

    const encounteredFilenames = new Set<string>();

    let invalidFilesWritten = 0;
    let rawFilesWritten = 0;
    let validFilesWritten = 0;

    uniqueEntries.forEach((entry) => {
        const entryFilename = structuredClone(filename);
        const entryIsValid = entry.classification === "ok";

        if (!entryIsValid) {
            entryFilename.flags = "invalid";
        }

        if (entryFilename.flags === "invalid") {
            invalidFilesWritten++;
        }
        else if (entryFilename.flags === "raw") {
            rawFilesWritten++;
        }
        else {
            validFilesWritten++;
        }

        const filenameTimestamp = entryIsValid ? (entry.lastModified ?? entry.captureTimestamp) : entry.captureTimestamp
        entryFilename.timestamp = filenameTimestamp.toFormat('yyyyLLddHHmmss');

        let outputFilename = filenameToString(entryFilename, 'full');

        // Ensure uniqueness (this should not really happen so the filenames will look ugly)
        let counter = 1;
        while (encounteredFilenames.has(outputFilename)) {
            outputFilename = filenameToString(entryFilename, 'full', counter);
            counter++;
        }
        encounteredFilenames.add(outputFilename);

        const mainDir = outputDirectory;
        const archivalDir = path.join(outputDirectory, '.archivaldata');
        fs.mkdirSync(archivalDir, { recursive: true });
        fs.mkdirSync(mainDir, { recursive: true });

        const outputDir = entryFilename.flags ? archivalDir : mainDir;
        const outputPath = path.join(outputDir, outputFilename);

        fs.writeFileSync(outputPath, entry.content ?? Buffer.alloc(0));
        const modificationDate = entry.lastModified ?? entry.captureTimestamp;
        const mtime = modificationDate.toJSDate();
        fs.utimesSync(outputPath, mtime, mtime);
        const source = entry.lastModified ? 'Last-Modified header' : 'Wayback snapshot';
        console.log(`Saved ${outputFilename} with mtime ${modificationDate.toISO()} (from ${source})`);
        
        const untransformedName = getOriginalQueryString(filename);
        if (untransformedName) {
            const untransformedPath = path.join(archivalDir, `${outputFilename}.query.txt`);
            fs.writeFileSync(untransformedPath, untransformedName);
            console.log(`Saved original query string to ${untransformedPath}`);
        }
    });

    console.log(`${filenameToString(filename, 'simple')} - Total capture entries processed: ${captureEntries.length}`);

    if (validFilesWritten > 0) {
        console.log(`${filenameToString(filename, 'simple')} - Unique valid version files saved: ${validFilesWritten}`);
    }
    if (invalidFilesWritten > 0) {
        console.log(`${filenameToString(filename, 'simple')} - Unique invalid version files saved: ${invalidFilesWritten}`);
    }
    if (rawFilesWritten > 0) {
        console.log(`${filenameToString(filename, 'simple')} - Raw version files saved: ${rawFilesWritten}`);
    }
}
