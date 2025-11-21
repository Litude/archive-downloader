import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readWebsiteJsonConfig } from "./website-config/website-config";
import { DownloadFileInput } from "./types/download-input-types";
import { getSnapshotsForWebsiteFile } from "./downloader/snapshots";
import { downloadUniqueDigestsForSnapshots } from "./downloader/downloader";
import { computeSha256, computeWaybackDigest } from "./utils/hash";
import { classifyEntry } from "./classification/classifier";
import { DownloadedFile } from "./types/download-types";
import { parseHeaderTimestamps } from "./utils/timestamp";
import { fetchWaybackFileHeaders } from "./downloader/file-download";
import { CaptureEntry } from "./types/capture-types";
import { writeCsvSummary } from "./output/summary";
import { writeUniqueFileEntries } from "./output/write-files";
import { getWaybackFilename } from "./utils/wayback-filename";
import { applyTransformationPipeline } from "./transformation/transformation";
import { filenameToString } from "./file-name/file-name";
import { writeUnavailablePlaceholder } from "./output/unavailable";
import { writeFileHeaders } from "./output/header-output";

// High level logic of app:
// 1. Read input JSON file to get list of DownloadFileInput
// 2. For each DownloadFileInput, process its URLs to get CDX entries
// 3. Apply any special rules (like limited captures) to filter CDX entries
// 4. Find all unique digests across all URLs for the file
// 5. Download each unique snapshot once and save to output directory



function computeDigestHashes(uniqueDigestFiles: Map<string, DownloadedFile>) {
  const digestHashes = new Map<string, { sha256: string; actualDigest: string }>();
  
  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const sha256 = computeSha256(file.content);
    const actualDigest = computeWaybackDigest(file.content);
    digestHashes.set(digest, { sha256, actualDigest });
  });
  
  return digestHashes;
}

function classifyDigestFiles(uniqueDigestFiles: Map<string, DownloadedFile>, digestHashes: Map<string, { sha256: string; actualDigest: string }>) {
  const classifications = new Map<string, string>();
  
  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const hashes = digestHashes.get(digest)!;
    const classification = classifyEntry(
      file.url, 
      hashes.sha256, 
      file.headers['content-type'], 
      file.content, 
      file.corrupt,
      file.statusCode
    );
    classifications.set(digest, classification);
  });
  
  return classifications;
}

async function processWebsiteDownloads(
  downloadInputs: DownloadFileInput[],
  {
    includeInvalid = false,
    peekAllFiles = false,
    writeHeaders = false,
  }: {
    includeInvalid?: boolean
    peekAllFiles?: boolean
    writeHeaders?: boolean
  }
) {
  for (const input of downloadInputs) {

    const { validCdxEntries, invalidCdxEntries } = await getSnapshotsForWebsiteFile(
      input, includeInvalid
    );
    const allEntries = [...validCdxEntries, ...invalidCdxEntries];
    const uniqueDigestFiles = await downloadUniqueDigestsForSnapshots(allEntries);
    const digestFileHashes = computeDigestHashes(uniqueDigestFiles);
    const classifiedEntries = classifyDigestFiles(uniqueDigestFiles, digestFileHashes);

    const enrichedDigestFiles = new Map<string, { file: DownloadedFile; classification: string; sha256: string; actualDigest: string }>();
    [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
      const hashes = digestFileHashes.get(digest)!;
      const classification = classifiedEntries.get(digest)!;
      enrichedDigestFiles.set(digest, { file, classification, sha256: hashes.sha256, actualDigest: hashes.actualDigest });
    });

    const baseEntries: CaptureEntry[] = allEntries.map(entry => {
      const downloadedFile = uniqueDigestFiles.get(entry.digest);
      if (!downloadedFile) {
        throw new Error(`Downloaded file for digest ${entry.digest} not found?!`);
      }

      const downloadIsExactMatch = entry.url === downloadedFile.url && entry.timestamp === downloadedFile.timestamp;
      const timestamps = parseHeaderTimestamps(downloadedFile.headers, entry.timestamp);
      const waybackFilename = peekAllFiles && downloadIsExactMatch ? getWaybackFilename(downloadedFile.headers) : undefined;
      const lastModified = (downloadIsExactMatch || !peekAllFiles) ? timestamps.lastModified : null;
      const headers = downloadIsExactMatch ? downloadedFile.headers : undefined;

      return {
        timestamp: entry.timestamp,
        captureTimestamp: timestamps.captureDate,
        lastModified,
        url: entry.url,
        statusCode: entry.status,
        classification: classifiedEntries.get(entry.digest)!,
        mimetype: entry.mimetype,
        waybackDigest: entry.digest,
        waybackFilename,
        waybackLength: peekAllFiles ? entry.length : undefined,
        actualDigest: digestFileHashes.get(entry.digest)!.actualDigest,
        sha256: digestFileHashes.get(entry.digest)!.sha256,
        originalSha256: digestFileHashes.get(entry.digest)!.sha256,
        content: downloadedFile.content,
        downloadStatus: downloadIsExactMatch ? 'downloaded' : 'digest-match',
        headers,
        metadata: downloadIsExactMatch ? downloadedFile.metadata : undefined,
      }
    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // If peekAllFiles is enabled, we need to query wayback for the headers of all files that were not downloaded exactly
    if (peekAllFiles) {
      const entriesToPeek = baseEntries.filter(entry => entry.downloadStatus !== 'downloaded');
      console.log(`Headers to fetch for entries that were not downloaded: ${entriesToPeek.length}`);
      let currentIndex = 0;
      for (const entry of entriesToPeek) {
        console.log(`Fetching headers for ${entry.url} at ${entry.timestamp} (${++currentIndex}/${entriesToPeek.length}): `);
        const response = await fetchWaybackFileHeaders(entry.timestamp, entry.url, entry.statusCode);
        const timestamps = parseHeaderTimestamps(response.headers, entry.timestamp);
        const waybackFilename = getWaybackFilename(response.headers);
        const existingEntry = baseEntries.find(e => e.url === entry.url && e.timestamp === entry.timestamp);
        if (!existingEntry) {
          throw new Error(`Existing entry for ${entry.url} at ${entry.timestamp} not found?!`);
        }
        existingEntry.lastModified = timestamps.lastModified;
        existingEntry.waybackFilename = waybackFilename;
        existingEntry.headers = response.headers;
      }
    }
    // TODO: Else we may have some legacy special rules to handle missing last-modified headers (forcedUniqueEntries)
    const anyValidEntries = baseEntries.some(entry => entry.classification === 'ok');


    if (anyValidEntries && input.transformations.length > 0) {

      // First find all unique sha256 buffers
      const seenSha256Values = new Set<string>();
      const uniqueBuffers: { sha256: string; content: Buffer }[] = [];
      const validBaseEntries = baseEntries.filter(entry => entry.classification === 'ok');
      const invalidEntries = baseEntries.filter(entry => entry.classification !== 'ok');
      for (const entry of validBaseEntries) {
        if (!seenSha256Values.has(entry.sha256)) {
          uniqueBuffers.push({ sha256: entry.sha256, content: entry.content });
          seenSha256Values.add(entry.sha256);
        }
      }

      const transformationResults = applyTransformationPipeline(
        uniqueBuffers,
        input.transformations
      );
      console.log(`Transformation pipeline produced ${transformationResults.length} unique output files`);

      // first we need to group by all unique query param combinations (each produces a separate set of output files);

      const groupedByQueryParams = new Map<string, { content: Buffer; sourceSha256Values: string[] }[]>();
      for (const result of transformationResults) {
        const queryParamKey = Object.entries(result.queryParams).sort().map(([k, v]) => `${k}=${v ?? ''}`).join('&');
        if (!groupedByQueryParams.has(queryParamKey)) {
          groupedByQueryParams.set(queryParamKey, []);
        }
        groupedByQueryParams.get(queryParamKey)!.push({
          content: result.content,
          sourceSha256Values: result.sourceSha256Values,
        });
      }

      // For each group of query params, write the files (with the updated filename acc to the query params)

      const outputSha256Set = new Set<string>();

      for (const [queryParamKey, outputs] of groupedByQueryParams.entries()) {
        console.log(`Writing files for query params: ${queryParamKey} (${outputs.length} files)`);
        const queryParams = queryParamKey.split('&').reduce((acc, pair) => {
          const [k, v] = pair.split('=');
          acc[k] = v;
          return acc;
        }, {} as Record<string, string>);

        const filename = structuredClone(input.filename);
        filename.queryParams = Object.assign(filename.queryParams ?? {}, queryParams);

        const updatedEntries = validBaseEntries.map(entry => ({ ...entry }));

        for (const output of outputs) {
          // Find all entries that match any of the source sha256 values
          const matchingEntries = updatedEntries.filter(entry => output.sourceSha256Values.includes(entry.sha256));
          const outputSha256 = computeSha256(output.content);
          outputSha256Set.add(outputSha256);
          for (const entry of matchingEntries) {
            // If the content is different, update the entry
            if (entry.sha256 !== outputSha256) {
              entry.content = output.content;
              entry.originalSha256 = entry.sha256
              entry.sha256 = outputSha256;
              entry.lastModified = null; // since content changed (this should be null for inputs anyway, but just to be sure)
            }
          }
        }
        writeUniqueFileEntries(updatedEntries, filename, input.outputDirectory);
        const summaryEntries = [...updatedEntries, ...invalidEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        await writeCsvSummary(summaryEntries, filename, input.outputDirectory);
      }

      // Finally write out any raw files that were not part of the transformations
      const rawFiles = baseEntries.filter(entry => entry.classification !== 'ok' || !outputSha256Set.has(entry.sha256));
      const rawFilename = structuredClone(input.filename);
      rawFilename.flags = "raw";
      writeUniqueFileEntries(rawFiles, rawFilename, input.outputDirectory);

    }
    else {
      if (!anyValidEntries) {
        const finalName = filenameToString(input.filename, 'simple');
        console.log(`Unable to download any valid files for ${finalName}, creating empty placeholder ${finalName}`);
        writeUnavailablePlaceholder(input.filename, input.outputDirectory);
      }
      writeUniqueFileEntries(baseEntries, input.filename, input.outputDirectory);
      await writeCsvSummary(baseEntries, input.filename, input.outputDirectory);
    }

    if (writeHeaders) {
      writeFileHeaders(baseEntries, input.filename, input.outputDirectory);
    }

    console.log('\n----------------------------------------\n');
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('output-dir', { type: 'string', default: 'output', describe: 'Directory to write output files' })
    .option('mirrors', { type: 'string', default: '', describe: 'Comma-separated list of additional mirror URLs' })
    .option('max-timestamp', { type: 'string', default: '', describe: 'Maximum timestamp for CDX index entries' })
    .option('min-timestamp', { type: 'string', default: '', describe: 'Minimum timestamp for CDX index entries' })
    .option('json', { type: 'string', describe: 'Path to JSON input file' })
    .option('mirrors', { type: 'boolean', default: true, describe: 'Use mirrors and additional URLs' })
    .option('peek-all', { type: 'boolean', default: false, describe: 'Peek into all downloaded files to get accurate last-modified timestamps and wayback filenames' })
    .option('headers', { type: 'boolean', default: false, describe: 'Write HTTP headers for each downloaded file (requires --peek-all)' })
    .option('include-invalid', { type: 'boolean', default: false, describe: 'Include invalid snapshots when downloading' })
    .demandCommand(0)
    .parse();

    // Validate invalid parameter combinations
    if (argv.headers && !argv['peek-all']) {
      throw new Error('--headers option requires --peek-all to be enabled');
    }

    if (argv.json) {
        const downloadInputs = readWebsiteJsonConfig(argv.json, argv['output-dir'], { noMirrors: !argv['mirrors'] });
        await processWebsiteDownloads(downloadInputs, {
          includeInvalid: argv['include-invalid'],
          peekAllFiles: argv['peek-all'],
          writeHeaders: argv['headers'],
        });
        return;
    }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
