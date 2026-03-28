import JSON5 from "json5";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { DownloadFileInput, UrlEntry } from "../types/download-input-types.js";
import {
  determineFilenameFromUrls,
  determineOutputSubdirectoryFromUrls,
} from "../file-name/file-name.js";
import { createMirrorUrls } from "../mirrors/mirrors.js";
import { createAdditionalUrls } from "../mirrors/additional-urls.js";
import { readFileAsJson5 } from "../utils/file-json.js";
import { MirrorData, MirrorUrlData, WebsiteFileEntryJson } from "../types/website-types.js";
import { parseJsonTransformations } from "../transformation/transformation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  minTimestamp?: string,
): {
  url: string;
  maxTimestamp?: string;
  minTimestamp?: string;
}[] {
  if (entry.urls) {
    return entry.urls.map((u) =>
      typeof u === "string"
        ? {
            url: u,
            maxTimestamp: entry.maxTimestamp ?? maxTimestamp,
            minTimestamp: entry.minTimestamp ?? minTimestamp,
          }
        : {
            url: u.url,
            maxTimestamp: u.maxTimestamp ?? entry.maxTimestamp ?? maxTimestamp,
            minTimestamp: u.minTimestamp ?? entry.minTimestamp ?? minTimestamp,
          },
    );
  } else if (entry.url) {
    return [
      {
        url: entry.url,
        maxTimestamp: entry.maxTimestamp ?? maxTimestamp,
        minTimestamp: entry.minTimestamp ?? minTimestamp,
      },
    ];
  } else {
    throw new Error('Each file entry must have either "url" or "urls" field');
  }
}

// Reads defined mirrors, additional mirrors and additional URLs
// and creates the full list of URLs for each file entry
function createAllMirrorUrls(
  urls: UrlEntry[],
  file: WebsiteFileEntryJson,
  mirrors: (string | MirrorData | MirrorUrlData)[],
  {
    maxTimestamp,
    minTimestamp,
  }: {
    maxTimestamp?: string;
    minTimestamp?: string;
  },
): UrlEntry[] {
  const mirrorUrls = createMirrorUrls(urls, mirrors);
  const additionalUrls = file.additionalUrls
    ? createAdditionalUrls(
        file.additionalUrls,
        file.maxTimestamp ?? maxTimestamp,
        file.minTimestamp ?? minTimestamp,
      )
    : [];
  return [...mirrorUrls, ...additionalUrls];
}

function replaceJsonConfigVariables<T>(obj: T, variables: Record<string, any>): T {
  if (typeof obj === "string") {
    return obj.replace(/\{var:([^}]+)\}/g, (match, varName) => {
      if (!(varName in variables)) {
        throw new Error(`Variable "${varName}" not found in variable map`);
      }
      return variables[varName];
    }) as T;
  } else if (Array.isArray(obj)) {
    return obj.map((item) => replaceJsonConfigVariables(item, variables)) as T;
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, replaceJsonConfigVariables(v, variables)]),
    ) as T;
  }
  return obj;
}

function readVariables(): Record<string, any> {
  const variablesPath = path.join(__dirname, "../../data/settings/variables.json");
  if (fs.existsSync(variablesPath)) {
    try {
      const variablesContent = fs.readFileSync(variablesPath, "utf-8");
      return JSON5.parse(variablesContent);
    } catch (error) {
      console.error(`Error reading variables from ${variablesPath}:`, error);
      return {};
    }
  } else {
    console.warn(
      `Variables file not found at ${variablesPath}, proceeding without variable substitution.`,
    );
    return {};
  }
}

export function readWebsiteJsonConfig(
  jsonPath: string,
  baseDirectory: string,
  { noMirrors = false },
): DownloadFileInput[] {
  let config = readFileAsJson5(jsonPath);
  const variables = readVariables();
  config = replaceJsonConfigVariables(config, variables);

  const commonMirrors: (string | MirrorData)[] = config.commonSettings?.additionalMirrors || [];
  const maxTimestamp: string | undefined = config.commonSettings?.maxTimestamp;
  const minTimestamp: string | undefined = config.commonSettings?.minTimestamp;
  const commonClassifications = config.commonSettings?.classifications || {};

  const files: WebsiteFileEntryJson[] = config.files;

  const result = files.map((file) => {
    const urls = getEntryUrls(file, maxTimestamp, minTimestamp);

    const mirrors = [...new Set([...(commonMirrors || []), ...(file.additionalMirrors || [])])];
    const filename = determineFilenameFromUrls(file, urls, file.queryParams);
    filename.queryParams = file.queryParams;
    const outputDir = determineOutputSubdirectoryFromUrls(
      urls,
      baseDirectory,
      config.commonSettings?.baseDirectory,
    );

    const allUrls = noMirrors
      ? urls
      : createAllMirrorUrls(urls, file, mirrors, { maxTimestamp, minTimestamp });

    const transformations = parseJsonTransformations(file.transformations || []);

    const allClassifications = { ...commonClassifications, ...file.classifications };

    if (file.excludedCaptures && file.excludedCaptures.length > 0) {
      throw new Error(
        'The "excludedCaptures" field is deprecated and should be handled by getting all headers',
      );
    }
    if (file.skippedFileWriteCaptures && file.skippedFileWriteCaptures.length > 0) {
      throw new Error(
        'The "skippedFileWriteCaptures" field is deprecated and should be handled by getting all headers',
      );
    }
    if (file.forcedUniqueEntries) {
      throw new Error(
        'The "forcedUniqueEntries" field is deprecated and should be handled by getting all headers',
      );
    }

    return {
      urls: allUrls,
      filename,
      outputDirectory: outputDir,
      commonCrawlEnabled: file.commonCrawlEnabled,
      transformations,
      queryHashParameters: file.queryHashParameters,
      classifications: Object.keys(allClassifications).length > 0 ? allClassifications : undefined,
      skippedCaptures:
        file.skippedCaptures && file.skippedCaptures.length > 0 ? file.skippedCaptures : undefined,
    } satisfies DownloadFileInput;
  });

  return result;
}
