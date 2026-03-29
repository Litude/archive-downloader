import fs from "fs";
import path from "path";
import { DownloadFileInput, Filename, LimitedCaptureRange } from "../types/download-input-types.js";
import { filenameToString } from "../file-name/file-name.js";
import { CaptureEntry } from "../types/capture-types.js";

export interface UrlMetadataFilteredEntries {
  /** This is only really relevant for wayback, in common crawl even duplicates could in theory be downloaded */
  duplicateTimestampsRemoved?: number;
  /** Limited capture ranges are ignored for common crawl, usually urls don't have massive amounts of captures in a short time there */
  limitedCaptureRanges?: {
    configs: LimitedCaptureRange[];
    count: number;
  };
  /** This is only really relevant for wayback, common crawl throws if a revisit is unresolvable */
  unresolvableRevisits?: {
    entries: {
      url: string;
      timestamps: string[];
    }[];
    count: number;
  };
  /** Cases where requested url ends with a /, but the received url does not and is a redirect to the slash url */
  nonTrailingSlashUrlRedirects?: number;
}

interface UrlMetadataArchivalRun {
  timestamp: string;
  type: "full" | "incremental";
  captureCounts: {
    totalCaptures: number;
    validCaptures: number;
    invalidCaptures: number;
    unavailableCaptures: number;
    skippedCaptures?: number;
  };
}

interface SourceCaptureCounts {
  totalCaptures: number;
  validCaptures: number;
  invalidCaptures: number;
  unavailableCaptures?: number;
  skippedCaptures?: number;
}

export interface UrlMetadata {
  maxTimestamp?: string;
  minTimestamp?: string;
  totalCaptures: number;
  validCaptures: number;
  invalidCaptures: number;
  unavailableCaptures: number;
  skippedCaptures?: number;
  sources: {
    wayback?: SourceCaptureCounts;
    commonCrawl?: SourceCaptureCounts;
  };
  filteredEntries: {
    wayback?: UrlMetadataFilteredEntries;
    commonCrawl?: UrlMetadataFilteredEntries;
  };
  archivalRuns: UrlMetadataArchivalRun[];
}

function getTimestampsFromFile(file: DownloadFileInput): {
  maxTimestamp?: string;
  minTimestamp?: string;
} {
  const timestamps: { maxTimestamp?: string; minTimestamp?: string } = {};
  const mainUrls = file.urls.filter((u) => !u.mirrorUrl);
  if (mainUrls.length > 0) {
    if (!mainUrls.some((u) => !u.maxTimestamp)) {
      timestamps.maxTimestamp = mainUrls.reduce(
        (max, u) => (u.maxTimestamp! > max ? u.maxTimestamp! : max),
        mainUrls[0].maxTimestamp!,
      );
    }
    if (!mainUrls.some((u) => !u.minTimestamp)) {
      timestamps.minTimestamp = mainUrls.reduce(
        (min, u) => (u.minTimestamp! < min ? u.minTimestamp! : min),
        mainUrls[0].minTimestamp!,
      );
    }
  }

  return timestamps;
}

function calculateSourceCaptureCounts(
  captureEntries: CaptureEntry[],
  unavailableEntries: CaptureEntry[],
  skippedEntries: CaptureEntry[],
  source: "wayback" | "commoncrawl",
): SourceCaptureCounts {
  const sourceEntries = captureEntries.filter((entry) => entry.cdxEntry.source === source);
  const sourceUnavailableEntries = unavailableEntries.filter(
    (entry) => entry.cdxEntry.source === source,
  );
  const sourceSkippedEntries = skippedEntries.filter((entry) => entry.cdxEntry.source === source);

  return {
    totalCaptures:
      sourceEntries.length + sourceUnavailableEntries.length + sourceSkippedEntries.length,
    validCaptures: sourceEntries.filter((entry) => entry.classification.type === "ok").length,
    invalidCaptures: sourceEntries.filter((entry) => entry.classification.type !== "ok").length,
    unavailableCaptures: sourceUnavailableEntries.length,
    skippedCaptures: sourceSkippedEntries.length ? sourceSkippedEntries.length : undefined,
  };
}

export function writeUrlMetadata(
  fileInput: DownloadFileInput,
  captureEntries: CaptureEntry[],
  unavailableEntries: CaptureEntry[],
  skippedEntries: CaptureEntry[],
  metadata: Record<"wayback" | "commonCrawl", UrlMetadataFilteredEntries>,
  filename: Filename,
  outputDirectory: string,
) {
  const timestamps = getTimestampsFromFile(fileInput);
  const totalCaptures = captureEntries.length + unavailableEntries.length + skippedEntries.length;
  const urlMetadata: UrlMetadata = {
    maxTimestamp: timestamps.maxTimestamp,
    minTimestamp: timestamps.minTimestamp,
    totalCaptures,
    validCaptures: captureEntries.filter((entry) => entry.classification.type === "ok").length,
    invalidCaptures: captureEntries.filter((entry) => entry.classification.type !== "ok").length,
    unavailableCaptures: unavailableEntries.length,
    skippedCaptures: skippedEntries.length ? skippedEntries.length : undefined,
    sources: {
      wayback: calculateSourceCaptureCounts(
        captureEntries,
        unavailableEntries,
        skippedEntries,
        "wayback",
      ),
      commonCrawl: calculateSourceCaptureCounts(
        captureEntries,
        unavailableEntries,
        skippedEntries,
        "commoncrawl",
      ),
    },
    filteredEntries: metadata,
    archivalRuns: [
      {
        timestamp: new Date().toISOString(),
        type: "full",
        captureCounts: {
          totalCaptures,
          validCaptures: captureEntries.filter((entry) => entry.classification.type === "ok")
            .length,
          invalidCaptures: captureEntries.filter((entry) => entry.classification.type !== "ok")
            .length,
          unavailableCaptures: unavailableEntries.length,
          skippedCaptures: skippedEntries.length ? skippedEntries.length : undefined,
        },
      },
    ],
  };

  const archivalDir = path.join(outputDirectory, ".archivaldata");
  if (!fs.existsSync(archivalDir)) {
    fs.mkdirSync(archivalDir, { recursive: true });
  }
  const urlMetadataPath = path.join(
    archivalDir,
    `${filenameToString(filename, "simple")}.metadata.json`,
  );
  try {
    fs.writeFileSync(urlMetadataPath, JSON.stringify(urlMetadata, null, 2));
    console.log(`URL metadata written to ${urlMetadataPath}`);
  } catch (error) {
    console.error(`Failed to write URL metadata: ${error}`);
  }
}
