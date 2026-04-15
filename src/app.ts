import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readWebsiteJsonConfig } from "./website-config/website-config.js";
import { DownloadFileInput } from "./types/download-input-types.js";
import { computeSha256 } from "./utils/hash.js";
import { CaptureEntry } from "./types/capture-types.js";
import { writeCsvSummary } from "./file-output/summary.js";
import { writeGlobalSummary } from "./file-output/global-summary.js";
import { writeUniqueFileEntries } from "./file-output/write-files.js";
import { applyTransformationPipeline } from "./transformation/transformation.js";
import { filenameToString } from "./file-name/file-name.js";
import { writeUnavailablePlaceholder } from "./file-output/unavailable.js";
import { writeUrlMetadata } from "./file-output/url-metadata.js";
import { Context } from "./types/context.js";
import { WithRequired } from "./utils/ts-utils.js";
import { downloadWaybackEntries } from "./downloader/downloader-wayback.js";
import { writeCaptureData } from "./file-output/capture-data.js";
import { assignCaptureIndices, assignContentIndices } from "./file-output/output-indices.js";
import { downloadCommonCrawlEntries } from "./downloader/downloader-commoncrawl.js";
import {
  CommonCrawlPrefetchedIndex,
  prefetchCdxIndex,
} from "./downloader/commoncrawl/cdx-prefetch.js";
import {
  COMMONCRAWL_REQUEST_DELAY_MS,
  COMMONCRAWL_REQUEST_TIMEOUT,
} from "./downloader/commoncrawl/commoncrawl-common.js";
import { validateCaptureEntries } from "./validation/validate-capture.js";
import { applyDataCorrectionsToEntry } from "./data-corrections/data-correction.js";
import { enrichCaptureEntryData } from "./enrichment/data-enrichment.js";
import { compareCaptureEntries } from "./capture-entry/capture-entry-compare.js";

function mergeWaybackAndCommonCrawlEntries(
  waybackEntries: CaptureEntry[],
  ccEntries: CaptureEntry[],
): CaptureEntry[] {
  const waybackCommonCrawlEntries = waybackEntries.filter((entry) =>
    entry.metadata?.wayback?.item.collections.some((collection) => collection.id === "commoncrawl"),
  );

  for (const waybackEntry of waybackCommonCrawlEntries) {
    const matchingCcEntry = ccEntries.find(
      (ccEntry) =>
        ccEntry.timestamp === waybackEntry.timestamp &&
        ccEntry.url === waybackEntry.url &&
        ccEntry.statusCode === waybackEntry.statusCode &&
        ccEntry.cdxEntry.digest === waybackEntry.cdxEntry.digest &&
        ccEntry.cdxEntry.length === waybackEntry.cdxEntry.length,
    );
    if (matchingCcEntry) {
      if (!matchingCcEntry.metadata) {
        matchingCcEntry.metadata = {};
      }
      const waybackCdx = waybackEntry.cdxEntry.revisitEntry ?? waybackEntry.cdxEntry;
      waybackCdx.offset = matchingCcEntry.cdxEntry.offset;
      matchingCcEntry.additionalSources = [
        {
          source: "wayback",
          cdxEntry: waybackCdx,
        },
      ];
      matchingCcEntry.metadata.wayback = waybackEntry.metadata?.wayback;
      matchingCcEntry.mementoDateTime = waybackEntry.mementoDateTime;
    } else {
      throw new Error(
        `Expected to find matching Common Crawl entry for wayback entry with timestamp ${waybackEntry.timestamp} and url ${waybackEntry.url}, but did not find one.`,
      );
    }
  }

  const mergedEntries = [
    ...waybackEntries.filter(
      (entry) =>
        !entry.metadata?.wayback?.item.collections.some(
          (collection) => collection.id === "commoncrawl",
        ),
    ),
    ...ccEntries,
  ];

  return mergedEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// High level logic of app:
// 1. Read input JSON file to get list of DownloadFileInput
// 2. For each DownloadFileInput, process its URLs to get CDX entries
// 3. Apply any special rules (like limited captures) to filter CDX entries
// 4. Find all unique digests across all URLs for the file
// 5. Download each unique snapshot once and save to output directory

function isCommonCrawlEnabledForInput(
  input: DownloadFileInput,
  prefetchedIndex?: CommonCrawlPrefetchedIndex,
): boolean {
  return (
    input.commonCrawlEnabled ||
    !!input.commonCrawlCollections?.length ||
    (prefetchedIndex
      ? Array.from(prefetchedIndex.keys()).some((prefix) =>
          input.urls.some((urlEntry) => urlEntry.url.startsWith(prefix)),
        )
      : false)
  );
}

async function processWebsiteDownloads(
  downloadInputs: DownloadFileInput[],
  {
    includeInvalid = false,
    peekAllFiles = false,
    writeHeaders = false,
    prefetchedIndex,
    websiteOutputDirectory,
    skipOn302 = 0,
    commonCrawlEnabled = true,
  }: {
    includeInvalid?: boolean;
    peekAllFiles?: boolean;
    writeHeaders?: boolean;
    prefetchedIndex?: CommonCrawlPrefetchedIndex;
    websiteOutputDirectory: string;
    skipOn302?: number;
    commonCrawlEnabled?: boolean;
  },
) {
  const context: Context = {
    settings: {
      includeInvalid,
      peekAllFiles,
      writeHeaders,
      fetchMetadata: true,
      fetchOriginalRecord: true,
      skipOn302: skipOn302 ? skipOn302 : undefined,
    },
    fileContext: {},
  };

  for (const input of downloadInputs) {
    context.fileContext = {};

    const {
      baseEntries: waybackEntries,
      unavailableEntries,
      skippedEntries,
      metadata: waybackDownloadMetadata,
    } = await downloadWaybackEntries(input, context);

    const { filteredEntries: commonCrawlEntries, metadata: commonCrawlDownloadMetadata } =
      commonCrawlEnabled && isCommonCrawlEnabledForInput(input, prefetchedIndex)
        ? await downloadCommonCrawlEntries(input, undefined, prefetchedIndex)
        : { filteredEntries: [], metadata: {} };

    const downloadMetadata = {
      wayback: waybackDownloadMetadata,
      commonCrawl: commonCrawlDownloadMetadata,
    };

    const baseEntries = commonCrawlEnabled
      ? mergeWaybackAndCommonCrawlEntries(waybackEntries, commonCrawlEntries)
      : waybackEntries;

    baseEntries.sort(compareCaptureEntries);
    unavailableEntries.sort(compareCaptureEntries);
    skippedEntries.sort(compareCaptureEntries);

    for (const entry of baseEntries) {
      enrichCaptureEntryData(entry);
    }

    for (const entry of baseEntries) {
      applyDataCorrectionsToEntry(entry);
    }

    validateCaptureEntries(baseEntries);

    assignCaptureIndices([...baseEntries, ...unavailableEntries, ...skippedEntries]);

    const anyValidEntries = baseEntries.some((entry) => entry.classification.type === "ok");

    if (anyValidEntries && input.transformations.length > 0) {
      // First find all unique sha256 buffers
      const seenSha256Values = new Set<string>();
      const uniqueBuffers: { sha256: string; content: Buffer }[] = [];
      const validBaseEntries = baseEntries.filter(
        (entry): entry is WithRequired<CaptureEntry, "sha256" | "content"> =>
          entry.classification.type === "ok",
      );
      const invalidEntries = baseEntries.filter((entry) => entry.classification.type !== "ok");
      for (const entry of validBaseEntries) {
        if (!seenSha256Values.has(entry.sha256)) {
          uniqueBuffers.push({ sha256: entry.sha256, content: entry.content });
          seenSha256Values.add(entry.sha256);
        }
      }

      const transformationResults = applyTransformationPipeline(
        uniqueBuffers,
        input.transformations,
      );
      console.log(
        `Transformation pipeline produced ${transformationResults.length} unique output files`,
      );

      // first we need to group by all unique query param combinations (each produces a separate set of output files);

      const groupedByQueryParams = new Map<
        string,
        { content: Buffer; sourceSha256Values: string[] }[]
      >();
      for (const result of transformationResults) {
        const queryParamKey = Object.entries(result.queryParams)
          .sort()
          .map(([k, v]) => `${k}=${v ?? ""}`)
          .join("&");
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
        const queryParams = queryParamKey.split("&").reduce(
          (acc, pair) => {
            const [k, ...v] = pair.split("=");
            acc[k] = v.join("=");
            return acc;
          },
          {} as Record<string, string>,
        );

        const filename = structuredClone(input.filename);
        filename.queryParams = Object.assign(filename.queryParams ?? {}, queryParams);

        const updatedEntries = validBaseEntries.map((entry) => ({ ...entry }));

        for (const output of outputs) {
          // Find all entries that match any of the source sha256 values
          const matchingEntries = updatedEntries.filter((entry) =>
            output.sourceSha256Values.includes(entry.sha256),
          );
          const outputSha256 = computeSha256(output.content);
          outputSha256Set.add(outputSha256);
          for (const entry of matchingEntries) {
            // If the content is different, update the entry
            if (entry.sha256 !== outputSha256) {
              entry.content = output.content;
              entry.originalSha256 = entry.sha256;
              entry.sha256 = outputSha256;
              entry.lastModified = null; // since content changed (this should be null for inputs anyway, but just to be sure)
            }
          }
        }
        assignContentIndices(updatedEntries);
        writeUniqueFileEntries(updatedEntries, filename, input.outputDirectory);
        const summaryEntries = [...updatedEntries, ...invalidEntries, ...unavailableEntries].sort(
          compareCaptureEntries,
        );
        await writeCsvSummary(summaryEntries, filename, input.outputDirectory);
        await writeGlobalSummary(
          summaryEntries,
          filename,
          input.outputDirectory,
          websiteOutputDirectory,
        );
        // This actually includes the raw and all invalid files
        const rawFiles = baseEntries.filter(
          (entry) =>
            entry.sha256 &&
            (entry.classification.type !== "ok" || !outputSha256Set.has(entry.sha256)),
        );
        const rawFilename = structuredClone(filename);
        // Invalid files get their flag set during write
        rawFilename.flags = "raw";
        writeUniqueFileEntries(rawFiles, rawFilename, input.outputDirectory);
        writeCaptureData(baseEntries, filename, input.outputDirectory);
        writeUrlMetadata(
          input,
          baseEntries,
          unavailableEntries,
          skippedEntries,
          downloadMetadata,
          filename,
          input.outputDirectory,
        );
      }
    } else {
      if (!anyValidEntries) {
        const finalName = filenameToString(input.filename, "simple");
        console.log(
          `Unable to download any valid files for ${finalName}, creating empty placeholder ${finalName}`,
        );
        writeUnavailablePlaceholder(input.filename, input.outputDirectory);
      }
      assignContentIndices(baseEntries);
      writeUniqueFileEntries(baseEntries, input.filename, input.outputDirectory);
      const summaryEntries = [...baseEntries, ...unavailableEntries, ...skippedEntries].sort(
        (a, b) => a.timestamp.localeCompare(b.timestamp),
      );
      await writeCsvSummary(summaryEntries, input.filename, input.outputDirectory);
      await writeGlobalSummary(
        summaryEntries,
        input.filename,
        input.outputDirectory,
        websiteOutputDirectory,
      );
      writeCaptureData(baseEntries, input.filename, input.outputDirectory);

      writeUrlMetadata(
        input,
        baseEntries,
        unavailableEntries,
        skippedEntries,
        downloadMetadata,
        input.filename,
        input.outputDirectory,
      );
    }

    console.log("\n----------------------------------------\n");
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("output-dir", {
      type: "string",
      default: "output",
      describe: "Directory to write output files",
    })
    .option("max-timestamp", {
      type: "string",
      default: "",
      describe: "Maximum timestamp for CDX index entries",
    })
    .option("min-timestamp", {
      type: "string",
      default: "",
      describe: "Minimum timestamp for CDX index entries",
    })
    .option("json", { type: "string", describe: "Path to JSON input file" })
    .option("mirrors", {
      type: "boolean",
      default: true,
      describe: "Use mirrors and additional URLs",
    })
    .option("common-crawl", {
      type: "boolean",
      default: true,
      describe: "Disable Common Crawl downloads for all inputs",
    })
    .option("peek-all", {
      type: "boolean",
      default: true,
      describe:
        "Peek into all downloaded files to get accurate last-modified timestamps and wayback filenames",
    })
    .option("skip-on-302", {
      type: "number",
      default: 0,
      describe:
        "Number of times to retry fetching a file if a 302 response is received from the web archive, as 302 can indicate a temporarily unavailable capture. 0 is infinite retries.",
    })
    .option("headers", {
      type: "boolean",
      default: true,
      describe: "Write HTTP headers for each downloaded file (requires --peek-all)",
    })
    .option("include-invalid", {
      type: "boolean",
      default: true,
      describe: "Include invalid snapshots when downloading",
    })
    .demandCommand(0)
    .parse();

  // Validate invalid parameter combinations
  if (argv.headers && !argv["peek-all"]) {
    throw new Error("--headers option requires --peek-all to be enabled");
  }

  if (argv.json) {
    console.log("=== Command line settings ===");
    console.log(`JSON input file: ${argv.json ?? "None"}`);
    console.log(`Output directory: ${argv["output-dir"]}`);
    console.log(`Use mirrors: ${argv["mirrors"]}`);
    console.log(`Peek all files: ${argv["peek-all"]}`);
    console.log(`Write headers: ${argv["headers"]}`);
    console.log(`Include invalid: ${argv["include-invalid"]}`);
    console.log(`Skip on 302: ${argv["skip-on-302"] ? argv["skip-on-302"] : "infinite"} retries`);
    console.log(`Common Crawl enabled: ${argv["common-crawl"]}`);
    console.log(`Max timestamp: ${argv["max-timestamp"] || "None"}`);
    console.log(`Min timestamp: ${argv["min-timestamp"] || "None"}`);
    console.log("================\n");
    const commonCrawlEnabled = argv["common-crawl"];
    const { downloadInputs, commonCrawlIndexQueries, websiteOutputDirectory } =
      readWebsiteJsonConfig(argv.json, argv["output-dir"], { noMirrors: !argv["mirrors"] });
    const prefetchedIndex =
      commonCrawlEnabled && commonCrawlIndexQueries.length > 0
        ? await prefetchCdxIndex(commonCrawlIndexQueries, {
            requestDelayMs: COMMONCRAWL_REQUEST_DELAY_MS,
            requestTimeoutMs: COMMONCRAWL_REQUEST_TIMEOUT,
          })
        : undefined;
    await processWebsiteDownloads(downloadInputs, {
      includeInvalid: argv["include-invalid"],
      peekAllFiles: argv["peek-all"],
      writeHeaders: argv["headers"],
      prefetchedIndex,
      websiteOutputDirectory,
      skipOn302: argv["skip-on-302"],
      commonCrawlEnabled,
    });
    return;
  } else {
    console.log("No input JSON file specified, nothing to do.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
