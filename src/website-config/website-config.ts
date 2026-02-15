import { DownloadFileInput, UrlEntry } from "../types/download-input-types";
import { determineFilenameFromUrls, determineOutputSubdirectoryFromUrls } from "../file-name/file-name";
import { createMirrorUrls } from "../mirrors/mirrors";
import { createAdditionalUrls } from "../mirrors/additional-urls";
import { checkForLimitedCaptureUrl } from "../special-rules/limit-captures";
import { readFileAsJson5 } from "../utils/file-json";
import { WebsiteFileEntryJson } from "../types/website-types";
import { parseJsonTransformations } from "../transformation/transformation";

// Timestamps can be limited at several levels:
// - Global max/min timestamps for all urls in a json file
// - Per-file max/min timestamps in a json file
// - Per-url max/min timestamps in a json file
// - Per-mirror max timestamps in mirrors.json

// This handles the three first cases, and in these cases the precedence is as follows:
// - Global timestamp is the default
// - This can be overridden by per-file timestamp
// - This can be overridden by per-url timestamp

// The mirror specific timestamps are handled in mirrors.ts (they will clamp the other timestamps)

function getEntryUrls(
    entry: WebsiteFileEntryJson,
    maxTimestamp?: string,
    minTimestamp?: string
): {
    url: string,
    maxTimestamp?: string,
    minTimestamp?: string
}[] {
    if (entry.urls) {
        return entry.urls.map(
        u => typeof u === "string" ?
            { url: u, maxTimestamp: entry.maxTimestamp ?? maxTimestamp, minTimestamp: entry.minTimestamp ?? minTimestamp }
        : { url: u.url, maxTimestamp: u.maxTimestamp ?? entry.maxTimestamp ?? maxTimestamp, minTimestamp: u.minTimestamp ?? entry.minTimestamp ?? minTimestamp }
        );
    } else if (entry.url) {
        return [{ url: entry.url, maxTimestamp: entry.maxTimestamp ?? maxTimestamp, minTimestamp: entry.minTimestamp ?? minTimestamp }];
    } else {
        throw new Error('Each file entry must have either "url" or "urls" field');
    }
}

// Reads defined mirrors, additional mirrors and additional URLs
// and creates the full list of URLs for each file entry
function createAllMirrorUrls(
  urls: UrlEntry[],
  file: WebsiteFileEntryJson,
  mirrors: string[],
  {
    maxTimestamp,
    minTimestamp
  } : {
    maxTimestamp?: string,
    minTimestamp?: string
  }
): UrlEntry[] {
    const mirrorUrls = createMirrorUrls(urls, mirrors);
    const additionalUrls = file.additionalUrls ? createAdditionalUrls(file.additionalUrls, file.maxTimestamp ?? maxTimestamp, file.minTimestamp ?? minTimestamp) : [];
    return [...mirrorUrls, ...additionalUrls];
}

export function readWebsiteJsonConfig(jsonPath: string, baseDirectory: string, {
  noMirrors = false
}): DownloadFileInput[] {
  const config = readFileAsJson5(jsonPath);

  const commonMirrors: string[] = config.commonSettings?.additionalMirrors || [];
  const maxTimestamp: string | undefined = config.commonSettings?.maxTimestamp;
  const minTimestamp: string | undefined = config.commonSettings?.minTimestamp;

  const files: WebsiteFileEntryJson[] = config.files;

  const result = files.map(file => {
    const urls = getEntryUrls(file, maxTimestamp, minTimestamp);

    const mirrors = [...new Set([
      ...(commonMirrors || []),
      ...(file.additionalMirrors || [])
    ])];
    const filename = determineFilenameFromUrls(file, urls, file.queryParams);
    filename.queryParams = file.queryParams;
    const outputDir = determineOutputSubdirectoryFromUrls(urls, baseDirectory, config.commonSettings?.baseDirectory);

    const allUrls = noMirrors ? urls : createAllMirrorUrls(urls, file, mirrors, { maxTimestamp, minTimestamp });

    const limitedCaptures = urls.map(u => checkForLimitedCaptureUrl(u.url)).filter(c => c !== null);

    const transformations = parseJsonTransformations(file.transformations || []);

    if (file.excludedCaptures && file.excludedCaptures.length > 0) {
      throw new Error('The "excludedCaptures" field is deprecated and should be handled by getting all headers');
    }
    if (file.skippedFileWriteCaptures && file.skippedFileWriteCaptures.length > 0) {
      throw new Error('The "skippedFileWriteCaptures" field is deprecated and should be handled by getting all headers');
    }
    if (file.forcedUniqueEntries) {
      throw new Error('The "forcedUniqueEntries" field is deprecated and should be handled by getting all headers');
    }

    return {
      urls: allUrls,
      filename,
      outputDirectory: outputDir,
      limitedCaptures,
      transformations,
      queryHashParameters: file.queryHashParameters,
    };
  });

  return result;
}
