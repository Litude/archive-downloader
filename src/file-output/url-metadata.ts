import fs from "fs";
import path from "path";
import { Filename, LimitedCaptureRange } from "../types/download-input-types.js";
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
  };
}

export interface UrlMetadata {
  totalCaptures: number;
  validCaptures: number;
  invalidCaptures: number;
  unavailableCaptures: number;
  sources: {
    wayback?: number;
    commonCrawl?: number;
  };
  filteredEntries: {
    wayback?: UrlMetadataFilteredEntries;
    commonCrawl?: UrlMetadataFilteredEntries;
  };
  archivalRuns: UrlMetadataArchivalRun[];
}

export function writeUrlMetadata(
  captureEntries: CaptureEntry[],
  unavailableEntries: CaptureEntry[],
  metadata: Record<"wayback" | "commonCrawl", UrlMetadataFilteredEntries>,
  filename: Filename,
  outputDirectory: string,
) {
  const urlMetadata: UrlMetadata = {
    totalCaptures: captureEntries.length,
    validCaptures: captureEntries.filter((entry) => entry.classification.type === "ok").length,
    invalidCaptures: captureEntries.filter((entry) => entry.classification.type !== "ok").length,
    unavailableCaptures: unavailableEntries.length,
    sources: {
      wayback: captureEntries.filter((entry) => entry.cdxEntry.source === "wayback").length,
      commonCrawl: captureEntries.filter((entry) => entry.cdxEntry.source === "commoncrawl").length,
    },
    filteredEntries: metadata,
    archivalRuns: [
      {
        timestamp: new Date().toISOString(),
        type: "full",
        captureCounts: {
          totalCaptures: captureEntries.length,
          validCaptures: captureEntries.filter((entry) => entry.classification.type === "ok")
            .length,
          invalidCaptures: captureEntries.filter((entry) => entry.classification.type !== "ok")
            .length,
          unavailableCaptures: unavailableEntries.length,
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
