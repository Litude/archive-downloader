import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readWebsiteJsonConfig } from "./website-config/website-config";
import { DownloadFileInput } from "./types/download-input-types";
import { computeSha256 } from "./utils/hash";
import { CaptureEntry } from "./types/capture-types";
import { writeCsvSummary } from "./file-output/summary";
import { writeUniqueFileEntries } from "./file-output/write-files";
import { applyTransformationPipeline } from "./transformation/transformation";
import { filenameToString } from "./file-name/file-name";
import { writeUnavailablePlaceholder } from "./file-output/unavailable";
import { writeUrlMetadata } from "./file-output/url-metadata";
import { resetLog } from "./utils/log-context";
import { Context } from "./types/context";
import { WithRequired } from './utils/ts-utils';
import { downloadWaybackEntries } from "./downloader/downloader-wayback";
import { assignCaptureIndices, writeCaptureData } from "./file-output/capture-data";

// High level logic of app:
// 1. Read input JSON file to get list of DownloadFileInput
// 2. For each DownloadFileInput, process its URLs to get CDX entries
// 3. Apply any special rules (like limited captures) to filter CDX entries
// 4. Find all unique digests across all URLs for the file
// 5. Download each unique snapshot once and save to output directory


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
      fetchMetadata: true,
      fetchOriginalRecord: true,
    },
    fileContext: {},
  };

  for (const input of downloadInputs) {
    context.fileContext = {};
    resetLog();

    let { baseEntries, unavailableEntries, skippedEntries, metadata } = await downloadWaybackEntries(input, context);
    const anyValidEntries = baseEntries.some(entry => entry.classification === 'ok');

    input.filename.queryHashParameters = input.queryHashParameters;
    if (anyValidEntries && input.transformations.length > 0) {

      // First find all unique sha256 buffers
      const seenSha256Values = new Set<string>();
      const uniqueBuffers: { sha256: string; content: Buffer }[] = [];
      const validBaseEntries = baseEntries.filter((entry): entry is WithRequired<CaptureEntry, 'sha256' | 'content'> => entry.classification === 'ok');
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
        assignCaptureIndices(updatedEntries, filename);
        writeUniqueFileEntries(updatedEntries, filename, input.outputDirectory);
        const summaryEntries = [...updatedEntries, ...invalidEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        await writeCsvSummary(summaryEntries, filename, input.outputDirectory);
        const rawFiles = baseEntries.filter(entry => entry.sha256 && (entry.classification !== 'ok' || !outputSha256Set.has(entry.sha256)));
        const rawFilename = structuredClone(filename);
        rawFilename.flags = "raw";
        writeUniqueFileEntries(rawFiles, rawFilename, input.outputDirectory);
        // Invalid entries are only written once for the "base" file later
        if (writeHeaders) {
          writeCaptureData(updatedEntries, filename, input.outputDirectory);
        }
      }
    }
    else {
      if (!anyValidEntries) {
        const finalName = filenameToString(input.filename, 'simple');
        console.log(`Unable to download any valid files for ${finalName}, creating empty placeholder ${finalName}`);
        writeUnavailablePlaceholder(input.filename, input.outputDirectory);
      }
      assignCaptureIndices(baseEntries, input.filename);
      writeUniqueFileEntries(baseEntries, input.filename, input.outputDirectory);
      const summaryEntries = [...baseEntries, ...unavailableEntries, ...skippedEntries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      await writeCsvSummary(summaryEntries, input.filename, input.outputDirectory);
      if (writeHeaders) {
        writeCaptureData(baseEntries, input.filename, input.outputDirectory);
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
