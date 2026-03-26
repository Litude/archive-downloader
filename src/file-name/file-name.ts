import path from "path";
import { Filename, UrlEntry } from "../types/download-input-types.js";
import { QueryHashParameter, WebsiteFileEntryJson } from "../types/website-types.js";

/**
 * Transform query parameters into a shortened hash based on queryHashParameters configuration
 * @param queryParams The original query parameters
 * @param queryHashParameters The configuration for extracting meaningful parts
 * @returns The transformed query params and the original query params
 */
function transformQueryParams(
  queryParams: Record<string, string> | undefined,
  queryHashParameters: QueryHashParameter[] | undefined,
): {
  queryParams: Record<string, string> | undefined;
  originalQueryParams: Record<string, string> | undefined;
} {
  if (!queryParams || !queryHashParameters || queryHashParameters.length === 0) {
    return { queryParams, originalQueryParams: undefined };
  }

  const originalQueryParams = { ...queryParams };
  const transformedParams: Record<string, string> = {};

  for (const hashParam of queryHashParameters) {
    const originalValue = queryParams[hashParam.paramName];

    if (!originalValue) {
      if (hashParam.required) {
        // If required param is missing, return original params unchanged
        return { queryParams, originalQueryParams: undefined };
      }
      continue;
    }
    if (hashParam.outputName === null) {
      // If outputName is explicitly set to null, we want to remove this param from the output
      continue;
    }

    if (hashParam.outputValue !== undefined) {
      // If outputValue is provided, we will use it directly without applying the regex pattern
      transformedParams[hashParam.outputName ?? hashParam.paramName] = hashParam.outputValue;
      continue;
    } else {
      try {
        const regex = new RegExp(hashParam.pattern);
        const match = regex.exec(originalValue);

        if (match) {
          // Extract the capture groups specified in the configuration
          const extractedParts = hashParam.captureGroups
            .map((groupIndex) => match[groupIndex])
            .filter((part) => part !== undefined);

          if (extractedParts.length > 0) {
            transformedParams[hashParam.outputName ?? hashParam.paramName] =
              extractedParts.join("-");
          } else if (hashParam.required) {
            // If required param doesn't match pattern, return original params
            return { queryParams, originalQueryParams: undefined };
          }
        } else if (hashParam.required) {
          // If required param doesn't match pattern, return original params
          return { queryParams, originalQueryParams: undefined };
        }
      } catch (error) {
        console.warn(`Invalid regex pattern in queryHashParameters: ${hashParam.pattern}`, error);
        if (hashParam.required) {
          return { queryParams, originalQueryParams: undefined };
        }
      }
    }
  }

  // If we successfully transformed any parameters, return the transformed version
  if (Object.keys(transformedParams).length > 0) {
    return { queryParams: transformedParams, originalQueryParams };
  }

  // Otherwise return original params unchanged
  return { queryParams, originalQueryParams: undefined };
}

export function determineFilenameFromUrls(
  file: WebsiteFileEntryJson,
  urls: UrlEntry[],
  queryParams: Record<string, string> | undefined,
): Filename {
  if (file.filename) {
    return {
      base: path.parse(file.filename).name,
      ext: path.parse(file.filename).ext,
      queryParams,
    };
  }
  if (urls.length > 0) {
    for (const urlEntry of urls) {
      if (!urlEntry.mirrorUrl && !urlEntry.url.endsWith("/")) {
        const outputParams =
          (queryParams ?? urlEntry.url.includes("?"))
            ? Object.fromEntries(new URLSearchParams(urlEntry.url.split("?")[1]))
            : undefined;
        return {
          base: path.parse(urlEntry.url).name,
          ext: path.parse(urlEntry.url).ext,
          queryParams: outputParams,
        };
      }
    }
  }
  throw new Error(
    "Cannot determine filename: no filename specified and no original URL with filename found",
  );
}

// Output dir: output/domain/path
export function determineOutputSubdirectoryFromUrls(
  urls: UrlEntry[],
  rootDirectory: string,
  websiteDirectory?: string,
): string {
  const outputRoot = websiteDirectory ? path.join(rootDirectory, websiteDirectory) : rootDirectory;
  for (const urlEntry of urls) {
    if (!urlEntry.mirrorUrl) {
      const urlParsed = new URL(urlEntry.url);
      const domain = urlParsed.hostname;
      let subPath = urlParsed.pathname.slice(1);
      if (subPath === "/") {
        return `${outputRoot}/${domain}/`;
      }
      // Dirname will ignore / if it is the last character and treat the preceding part only as the directory
      // So we need to add a dummy filename to ensure we get the full path
      else if (subPath.endsWith("/")) {
        subPath += "dummy";
      }
      return `${outputRoot}/${domain}/${path.dirname(subPath)}`;
    }
  }
  throw new Error("Cannot determine output subdirectory: no original URL with full path found");
}

const unsafeCharacterFallbackMap: Record<string, string> = {
  // ~h is reserved as prefix for hashed query strings
  "?": "~q",
  "/": "~s",
  "\\": "~b",
  "*": "~a",
  ":": "~c",
  "|": "~p",
  "<": "~l",
  ">": "~g",
  '"': "~'",
  "~": "~~",
};

function escapeFilename(filename: string): string {
  let escaped = "";
  for (const char of filename) {
    if (unsafeCharacterFallbackMap[char]) {
      escaped += unsafeCharacterFallbackMap[char];
    } else {
      escaped += char;
    }
  }
  return escaped;
}

function writeQueryParamsToString(
  queryParams: Record<string, string> | undefined,
  queryHashParameters?: QueryHashParameter[],
  escape = true,
): string {
  if (!queryParams) {
    return "";
  }
  let hashedQuery = false;

  // Transform query params if queryHashParameters are provided
  let paramsToWrite = queryParams;
  if (queryHashParameters && queryHashParameters.length > 0) {
    const transformed = transformQueryParams(queryParams, queryHashParameters);
    if (transformed.originalQueryParams) {
      // Transformation was successful, use the transformed params
      hashedQuery = true;
      paramsToWrite = transformed.queryParams ?? queryParams;
    }
  }

  // First we will sort alphabetically by key to ensure consistent ordering
  const sortedEntries = Object.entries(paramsToWrite).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB),
  );
  const paramsArray: string[] = [];
  for (const [key, value] of sortedEntries) {
    // We will ignore empty/null values
    if (value) {
      paramsArray.push(`${key}=${value}`);
    }
  }
  const result = paramsArray.join("&");
  if (result) {
    if (hashedQuery) {
      return `~h${result}`;
    } else {
      return escape ? escapeFilename(`?${result}`) : `?${result}`;
    }
  } else {
    return "";
  }
}

// To improve filename readability, we will format timestamps as YYYYMMDD-HHmmss instead of just YYYYMMDDHHmmss
function timestampFormatted(input: string): string {
  if (input.length === 14) {
    return `${input.slice(0, 8)}-${input.slice(8, 14)}`;
  } else {
    return input;
  }
}

export function filenameToString(
  filename: Filename,
  formatType: "simple" | "full" = "full",
  counter?: number,
): string {
  const base = escapeFilename(filename.base);
  const ext = escapeFilename(filename.ext);
  if (formatType === "simple") {
    return `${base}${writeQueryParamsToString(filename.queryParams, filename.queryHashParameters)}${ext}`;
  } else {
    return `${base}${writeQueryParamsToString(filename.queryParams, filename.queryHashParameters)}.${timestampFormatted(filename.timestamp ?? "19700101000000")}${counter !== undefined ? `_${counter}` : ""}${filename.flags ? `.${filename.flags}` : ""}${ext}`;
  }
}

/**
 * Get the original (untransformed) query parameters as a string for saving to a separate file
 * @param filename The filename object
 * @returns The original query string (without transformation), or undefined if no query params exist
 */
export function getOriginalQueryString(filename: Filename): string | undefined {
  if (!filename.queryParams) {
    return undefined;
  }

  // If queryHashParameters are provided, return the untransformed version
  if (filename.queryHashParameters && filename.queryHashParameters.length > 0) {
    // Write without transformation
    const queryString = writeQueryParamsToString(filename.queryParams, undefined, false);
    if (queryString.startsWith("?")) {
      return queryString.slice(1);
    } else {
      return queryString;
    }
  }

  // Otherwise, no transformation applies, so return undefined
  return undefined;
}
