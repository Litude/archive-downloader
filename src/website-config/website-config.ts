import JSON5 from "json5";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { DownloadFileInput, UrlEntry } from "../types/download-input-types.js";
import { CommonCrawlIndexQuery } from "../types/commoncrawl-types.js";
import { WaybackCdxIndexQuery } from "../types/wayback-types.js";
import {
  determineFilenameFromUrls,
  determineOutputSubdirectoryFromUrls,
} from "../file-name/file-name.js";
import { createMirrorUrls, getMirrorPrefixesForPrefix } from "../mirrors/mirrors.js";
import { createAdditionalUrls } from "../mirrors/additional-urls.js";
import { timestampMax, timestampMin } from "../utils/timestamp.js";
import { readFileAsJson5 } from "../utils/file-json.js";
import { MirrorData, MirrorUrlData, WebsiteFileEntryJson } from "../types/website-types.js";
import { parseJsonTransformations } from "../transformation/transformation.js";
import { parseTrailingSlashMode, TrailingSlashParsingMode } from "../url/trailing-slash.js";

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
  trailingSlashParsingMode?: TrailingSlashParsingMode;
}[] {
  if (entry.urls) {
    return entry.urls.map((u) =>
      typeof u === "string"
        ? {
            url: u,
            maxTimestamp: entry.maxTimestamp ?? maxTimestamp,
            minTimestamp: entry.minTimestamp ?? minTimestamp,
            trailingSlashParsingMode: parseTrailingSlashMode(entry.trailingSlashParsingMode),
          }
        : {
            url: u.url,
            maxTimestamp: u.maxTimestamp ?? entry.maxTimestamp ?? maxTimestamp,
            minTimestamp: u.minTimestamp ?? entry.minTimestamp ?? minTimestamp,
            trailingSlashParsingMode: parseTrailingSlashMode(
              u.trailingSlashParsingMode ?? entry.trailingSlashParsingMode,
            ),
          },
    );
  } else if (entry.url) {
    return [
      {
        url: entry.url,
        maxTimestamp: entry.maxTimestamp ?? maxTimestamp,
        minTimestamp: entry.minTimestamp ?? minTimestamp,
        trailingSlashParsingMode: parseTrailingSlashMode(entry.trailingSlashParsingMode),
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
  const trailingSlashParsingMode = parseTrailingSlashMode(file.trailingSlashParsingMode);
  const mirrorUrls = createMirrorUrls(urls, mirrors, trailingSlashParsingMode);
  const additionalUrls = file.additionalUrls
    ? createAdditionalUrls(
        file.additionalUrls,
        file.maxTimestamp ?? maxTimestamp,
        file.minTimestamp ?? minTimestamp,
        trailingSlashParsingMode,
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
): {
  downloadInputs: DownloadFileInput[];
  commonCrawlIndexQueries: CommonCrawlIndexQuery[];
  waybackCdxIndexQueries: WaybackCdxIndexQuery[];
  websiteOutputDirectory: string;
} {
  let config = readFileAsJson5(jsonPath);
  const variables = readVariables();
  config = replaceJsonConfigVariables(config, variables);

  const commonMirrors: (string | MirrorData)[] = config.commonSettings?.additionalMirrors || [];
  const maxTimestamp: string | undefined = config.commonSettings?.maxTimestamp;
  const minTimestamp: string | undefined = config.commonSettings?.minTimestamp;
  const commonClassifications = config.commonSettings?.classifications || {};
  const commonCrawlCdxIndexQueries: CommonCrawlIndexQuery[] =
    config.commonSettings?.commonCrawlCdxCacheQueries || [];
  const waybackCdxIndexQueries: WaybackCdxIndexQuery[] =
    config.commonSettings?.waybackCdxCacheQueries || [];

  const files: WebsiteFileEntryJson[] = config.files;

  const encounteredUrls = new Set<string>();

  const result: DownloadFileInput[] = files.map((file) => {
    const urls = getEntryUrls(file, maxTimestamp, minTimestamp);

    const mirrors = [...new Set([...(commonMirrors || []), ...(file.additionalMirrors || [])])];
    const filename = determineFilenameFromUrls(file, urls, file.queryParams);
    filename.queryParams = file.queryParams;
    filename.queryHashParameters = file.queryHashParameters;
    const outputDir = determineOutputSubdirectoryFromUrls(
      urls,
      baseDirectory,
      config.commonSettings?.baseDirectory,
    );

    const allUrls = noMirrors
      ? urls
      : createAllMirrorUrls(urls, file, mirrors, { maxTimestamp, minTimestamp });
      
    const newUrls = new Set<string>();
    allUrls.forEach((u) => {
      const normalized = new URL(u.url).toString()
        .replace(/^https?:\/\//, "")
        .replace(/^www\d*\./, "");
      if (encounteredUrls.has(normalized)) {
        console.warn(`Warning: URL "${u.url}" is duplicated across file entries`);
      } else {
        newUrls.add(normalized);
      }
    });
    // We don't want to warn for duplicates in the same file entry
    newUrls.forEach((u) => encounteredUrls.add(u));

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
      commonCrawlEnabled: file.commonCrawlEnabled ?? (!!file.commonCrawlCollections || undefined),
      commonCrawlCollections: file.commonCrawlCollections,
      transformations,
      queryHashParameters: file.queryHashParameters,
      classifications: Object.keys(allClassifications).length > 0 ? allClassifications : undefined,
      expectedStatusCodes: file.expectedStatusCodes,
      skippedCaptures:
        file.skippedCaptures && file.skippedCaptures.length > 0 ? file.skippedCaptures : undefined,
    } satisfies DownloadFileInput;
  });

  const websiteOutputDirectory = config.commonSettings?.baseDirectory
    ? path.join(baseDirectory, config.commonSettings.baseDirectory)
    : baseDirectory;

  const expandedWaybackCdxIndexQueries = expandWaybackQueriesWithMirrors(
    waybackCdxIndexQueries,
    files,
    commonMirrors,
    maxTimestamp,
    minTimestamp,
  );

  console.log(
    `Expanded Wayback CDX index queries:\n${JSON.stringify(expandedWaybackCdxIndexQueries, null, 2)}`,
  );

  return {
    downloadInputs: result,
    commonCrawlIndexQueries: commonCrawlCdxIndexQueries,
    waybackCdxIndexQueries: expandedWaybackCdxIndexQueries,
    websiteOutputDirectory,
  };
}

function expandWaybackQueriesWithMirrors(
  queries: WaybackCdxIndexQuery[],
  files: WebsiteFileEntryJson[],
  commonMirrors: (string | MirrorData)[],
  maxTimestamp: string | undefined,
  minTimestamp: string | undefined,
): WaybackCdxIndexQuery[] {
  const expandedQueries: WaybackCdxIndexQuery[] = [];

  for (const query of queries) {
    expandedQueries.push(query);

    const urlObj = new URL(query.prefix);
    const pathAndParams = urlObj.pathname + urlObj.search + urlObj.hash;

    // Track mirror prefixes with their timestamp ranges.
    // When the same mirror prefix is encountered from multiple files, widen the range so all
    // files are covered (take the earlier minTimestamp / later maxTimestamp), while still
    // honouring any constraint the mirror itself declares.
    const mirrorRanges = new Map<string, { minTimestamp?: string; maxTimestamp?: string }>();

    function addOrWidenMirror(
      mirrorPrefix: string,
      mirrorMinTimestamp: string | undefined,
      mirrorMaxTimestamp: string | undefined,
    ) {
      // Clamp the query-level timestamps with the mirror's own constraints
      const clampedMin = timestampMax(query.minTimestamp, mirrorMinTimestamp);
      const clampedMax = timestampMin(query.maxTimestamp, mirrorMaxTimestamp);

      if (mirrorRanges.has(mirrorPrefix)) {
        const existing = mirrorRanges.get(mirrorPrefix)!;
        // Widen: take the more permissive bound so every file that needs this mirror is covered.
        // If either side has no constraint (undefined), the combined result has no constraint.
        mirrorRanges.set(mirrorPrefix, {
          minTimestamp:
            existing.minTimestamp === undefined || clampedMin === undefined
              ? undefined
              : timestampMin(existing.minTimestamp, clampedMin),
          maxTimestamp:
            existing.maxTimestamp === undefined || clampedMax === undefined
              ? undefined
              : timestampMax(existing.maxTimestamp, clampedMax),
        });
      } else {
        mirrorRanges.set(mirrorPrefix, { minTimestamp: clampedMin, maxTimestamp: clampedMax });
      }
    }

    for (const mirror of getMirrorPrefixesForPrefix(query.prefix, commonMirrors)) {
      addOrWidenMirror(mirror.prefix, mirror.minTimestamp, mirror.maxTimestamp);
    }

    for (const file of files) {
      if (!file.additionalMirrors?.length) {
        continue;
      }
      const fileUrls = getEntryUrls(file, maxTimestamp, minTimestamp);
      const hasUrlUnderPrefix = fileUrls.some((u) => u.url.startsWith(query.prefix));
      if (!hasUrlUnderPrefix) {
        continue;
      }
      for (const mirror of file.additionalMirrors) {
        const mirrorBaseUrl = typeof mirror === "string" ? mirror : mirror.url;
        const mirrorPrefix = `${mirrorBaseUrl}${pathAndParams}`;
        const mirrorMinTimestamp = typeof mirror === "string" ? undefined : mirror.minTimestamp;
        const mirrorMaxTimestamp = typeof mirror === "string" ? undefined : mirror.maxTimestamp;
        addOrWidenMirror(mirrorPrefix, mirrorMinTimestamp, mirrorMaxTimestamp);
      }
    }

    for (const [
      mirrorPrefix,
      { minTimestamp: mirrorMin, maxTimestamp: mirrorMax },
    ] of mirrorRanges) {
      expandedQueries.push({
        prefix: mirrorPrefix,
        minTimestamp: mirrorMin,
        maxTimestamp: mirrorMax,
      });
    }
  }

  return expandedQueries;
}
