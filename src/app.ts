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
import { CaptureClassification, CaptureEntry } from "./types/capture-types";
import { writeCsvSummary } from "./output/summary";
import { writeUniqueFileEntries } from "./output/write-files";
import { getWaybackFilename } from "./utils/wayback-filename";
import { applyTransformationPipeline } from "./transformation/transformation";
import { filenameToString } from "./file-name/file-name";
import { writeUnavailablePlaceholder } from "./output/unavailable";
import { writeFileHeaders } from "./output/header-output";
import { DateTime } from "luxon";
import { writeUrlMetadata } from "./output/url-metadata";
import { resetLog } from "./utils/log-context";
import { CdxEntry } from "./types/wayback-types";
import { Context } from "./types/context";

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

function classifyDigestFiles(uniqueDigestFiles: Map<string, DownloadedFile>, digestHashes: Map<string, { sha256: string; actualDigest: string }>, classificationOverrides?: Record<string, CaptureClassification>) {
  const classifications = new Map<string, CaptureClassification>();
  
  [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
    const hashes = digestHashes.get(digest)!;
    const classification = classifyEntry(
      file.url, 
      hashes.sha256, 
      file.headers['content-type'], 
      file.content, 
      file.classification,
      file.statusCode,
      classificationOverrides,
    );
    classifications.set(digest, classification);
  });
  
  return classifications;
}

function isEntrySkipped(entry: CdxEntry, skippedCaptures?: { url: string; timestamp: string }[]) {
  if (!skippedCaptures) {
    return false;
  }
  return skippedCaptures.some(skipped => skipped.url === entry.url && skipped.timestamp === entry.timestamp);
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
  const context: Context = {
    settings: {
      includeInvalid,
      peekAllFiles,
      writeHeaders,
    },
    fileContext: {},
  };

  for (const input of downloadInputs) {
    context.fileContext = {};
    resetLog();

    const { validCdxEntries, invalidCdxEntries, metadata } = await getSnapshotsForWebsiteFile(
      input, includeInvalid
    );
    const allEntries = [...validCdxEntries, ...invalidCdxEntries];
    const uniqueDigestFiles = await downloadUniqueDigestsForSnapshots(allEntries.filter(entry => !isEntrySkipped(entry, input.skippedCaptures)));
    const digestFileHashes = computeDigestHashes(uniqueDigestFiles);
    const classifiedEntries = classifyDigestFiles(uniqueDigestFiles, digestFileHashes, input.classifications);

    const enrichedDigestFiles = new Map<string, { file: DownloadedFile; classification: CaptureClassification; sha256: string; actualDigest: string }>();
    [...uniqueDigestFiles.entries()].forEach(([digest, file]) => {
      const hashes = digestFileHashes.get(digest)!;
      const classification = classifiedEntries.get(digest)!;
      enrichedDigestFiles.set(digest, { file, classification, sha256: hashes.sha256, actualDigest: hashes.actualDigest });
    });

    let baseEntries: CaptureEntry[] = allEntries.map(entry => {
      const isSkipped = isEntrySkipped(entry, input.skippedCaptures);
      if (isSkipped) {
        return {
          timestamp: entry.timestamp,
          captureTimestamp: DateTime.fromFormat(entry.timestamp, 'yyyyLLddHHmmss', { zone: 'utc' }) as DateTime<true>,
          lastModified: null,
          url: entry.url,
          statusCode: entry.status,
          classification: 'skipped' as const,
          mimetype: entry.mimetype,
          waybackDigest: entry.digest,
          waybackFilename: undefined,
          waybackLength: peekAllFiles ? entry.length : undefined,
          actualDigest: '',
          sha256: '',
          originalSha256: undefined,
          content: Buffer.alloc(0),
          downloadStatus: 'skipped',
          headers: undefined,
          metadata: undefined,
        }
      }
      else {
        const downloadedFile = uniqueDigestFiles.get(entry.digest);
        if (!downloadedFile) {
          throw new Error(`Downloaded file for digest ${entry.digest} not found?!`);
        }

        const downloadIsExactMatch = entry.url === downloadedFile.url && entry.timestamp === downloadedFile.timestamp;
        const timestamps = parseHeaderTimestamps(downloadedFile.url, downloadedFile.headers, entry.timestamp, downloadIsExactMatch);
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
      }

    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const unavailableEntries = baseEntries.filter(entry => entry.classification === 'unavailable').map((entry) => {
      const captureTimestamp = DateTime.fromFormat(entry.timestamp, 'yyyyLLddHHmmss', { zone: 'utc' });
      if (!captureTimestamp.isValid) {
        throw new Error(`Invalid capture timestamp format: ${entry.timestamp}`);
      }
      return {
        timestamp: entry.timestamp,
        captureTimestamp,
        lastModified: null,
        url: entry.url,
        statusCode: entry.statusCode,
        classification: entry.classification,
        mimetype: entry.mimetype,
        waybackDigest: entry.waybackDigest,
        waybackFilename: undefined,
        waybackLength: entry.waybackLength,
        actualDigest: '',
        sha256: '',
        originalSha256: undefined,
        content: Buffer.alloc(0),
        downloadStatus: 'unavailable',
        headers: undefined,
        metadata: undefined,
       };
    });
    if (unavailableEntries.length > 0) {
      console.log(`Total unavailable entries for ${filenameToString(input.filename, 'simple')}: ${unavailableEntries.length}`);
    }
    const skippedEntries = baseEntries.filter(entry => entry.classification === 'skipped');
    if (skippedEntries.length > 0) {
      console.log(`Total skipped entries for ${filenameToString(input.filename, 'simple')}: ${skippedEntries.length}`);
    }
    baseEntries = baseEntries.filter(entry => entry.classification !== 'unavailable' && entry.classification !== 'skipped');

    // If peekAllFiles is enabled, we need to query wayback for the headers of all files that were not downloaded exactly
    if (peekAllFiles) {
      const entriesToPeek = baseEntries.filter(entry => entry.downloadStatus !== 'downloaded');
      console.log(`Headers to fetch for entries that were not downloaded: ${entriesToPeek.length}`);
      let currentIndex = 0;
      for (const entry of entriesToPeek) {
        console.log(`Fetching headers for ${entry.url} at ${entry.timestamp} (${++currentIndex}/${entriesToPeek.length}): `);
        const response = await fetchWaybackFileHeaders(entry.timestamp, entry.url, [entry.statusCode]);
        const timestamps = parseHeaderTimestamps(entry.url, response.headers, entry.timestamp, true);
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
    const anyValidEntries = baseEntries.some(entry => entry.classification === 'ok');

    input.filename.queryHashParameters = input.queryHashParameters;
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


      for (const [queryParamKey, outputs] of groupedByQueryParams.entries()) {
        const outputSha256Set = new Set<string>();
        console.log(`Writing files for query params: ${queryParamKey} (${outputs.length} files)`);
        const queryParams = queryParamKey.split('&').reduce((acc, pair) => {
          const [k, ...v] = pair.split('=');
          acc[k] = v.join('=');
          return acc;
        }, {} as Record<string, string>);

        const filename = structuredClone(input.filename);
        filename.queryParams = Object.assign(filename.queryParams ?? {}, queryParams);
        //filename.queryHashParameters = input.queryHashParameters;

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
        const rawFiles = baseEntries.filter(entry => entry.classification !== 'ok' || !outputSha256Set.has(entry.sha256));
        const rawFilename = structuredClone(filename);
        rawFilename.flags = "raw";
        writeUniqueFileEntries(rawFiles, rawFilename, input.outputDirectory);
        // Invalid entries are only written once for the "base" file later
        if (writeHeaders) {
          writeFileHeaders(updatedEntries, filename, input.outputDirectory);
        }
      }

      // Finally write out any raw files that were not part of the transformations
      // const rawFiles = baseEntries.filter(entry => entry.classification !== 'ok' || !outputSha256Set.has(entry.sha256));
      // const rawFilename = structuredClone(input.filename);
      // rawFilename.flags = "raw";
      // writeUniqueFileEntries(rawFiles, rawFilename, input.outputDirectory);
      // if (writeHeaders) {
      //   writeFileHeaders(invalidEntries, input.filename, input.outputDirectory);
      // }

    }
    else {
      if (!anyValidEntries) {
        const finalName = filenameToString(input.filename, 'simple');
        console.log(`Unable to download any valid files for ${finalName}, creating empty placeholder ${finalName}`);
        writeUnavailablePlaceholder(input.filename, input.outputDirectory);
      }
      writeUniqueFileEntries(baseEntries, input.filename, input.outputDirectory);
      const summaryEntries = [...baseEntries, ...unavailableEntries, ...skippedEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      await writeCsvSummary(summaryEntries, input.filename, input.outputDirectory);
      if (writeHeaders) {
        writeFileHeaders(baseEntries, input.filename, input.outputDirectory);
      }
    }

    if (metadata) {
      writeUrlMetadata(metadata, input.filename, input.outputDirectory);
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
    .option('peek-all', { type: 'boolean', default: true, describe: 'Peek into all downloaded files to get accurate last-modified timestamps and wayback filenames' })
    .option('headers', { type: 'boolean', default: true, describe: 'Write HTTP headers for each downloaded file (requires --peek-all)' })
    .option('include-invalid', { type: 'boolean', default: true, describe: 'Include invalid snapshots when downloading' })
    .demandCommand(0)
    .parse();

    // Validate invalid parameter combinations
    if (argv.headers && !argv['peek-all']) {
      throw new Error('--headers option requires --peek-all to be enabled');
    }

    if (argv.json) {
      console.log('=== Command line settings ===');
      console.log(`JSON input file: ${argv.json ?? 'None'}`);
      console.log(`Output directory: ${argv['output-dir']}`);
      console.log(`Use mirrors: ${argv['mirrors']}`);
      console.log(`Peek all files: ${argv['peek-all']}`);
      console.log(`Write headers: ${argv['headers']}`);
      console.log(`Include invalid: ${argv['include-invalid']}`);
      console.log(`Max timestamp: ${argv['max-timestamp'] || 'None'}`);
      console.log(`Min timestamp: ${argv['min-timestamp'] || 'None'}`);
      console.log('================\n');
      const downloadInputs = readWebsiteJsonConfig(argv.json, argv['output-dir'], { noMirrors: !argv['mirrors'] });
      await processWebsiteDownloads(downloadInputs, {
        includeInvalid: argv['include-invalid'],
        peekAllFiles: argv['peek-all'],
        writeHeaders: argv['headers'],
      });
      return;
    }
    else {
      console.log('No input JSON file specified, nothing to do.');
    }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
