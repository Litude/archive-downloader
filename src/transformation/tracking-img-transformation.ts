import { defaultBrowserPort } from "vitest/config";
import { TransformationInput, TransformationOutput } from "../types/transformation-types";

export interface TrackingImageTransformationOptions {
  path?: string; // default is to lowercase the path, but can be overridden with a specific value
  queryParameters?: "strip" | "from-transformation"; // from-transformation means that the query parameters of the tracking image will be replaced with the query parameters from the transformation input, strip means that all query parameters will be removed, default is to keep the query parameters but normalize them by lowercasing and removing referrer
  defaultPath?: string; // if the URI parameter ends with a /, this path will be appended to it. This is needed for later tracking urls that no longer append default.aspx to urls that did not originally include it
}

function encodeURIComponentLowerCase(str: string): string {
    return encodeURIComponent(str).replace(/%[0-9a-f]{2}/gi, match => match.toLowerCase());
}

function normalizeUrl(trackingUrl: string, separator: string, queryParams: Record<string, string | null>, options: TrackingImageTransformationOptions) {
    const [baseUrl, params] = trackingUrl.split("?");
    let modified = false;

    const paramParts = params.split(separator);
    const normalizedParams = paramParts.map(part => {
        if (part.startsWith("source=")) {
            if (part !== "source=www") {
                modified = true;
            }
            return "source=www";
        }
        else if (part.startsWith("URI=")) {
            const content = decodeURIComponent(part.substring("URI=".length));
            let [basePart, params] = content.split("?");
            // Complex URI means that the URI param consists of subparams where the actual url is in a subparam (h=domain and u=path)
            // Else the URI is just the actual URL of the page (excluding hostname) including query params
            const isComplexUri = basePart === "/library/toolbar/3.0/asp.aspx";
            if (isComplexUri && params) {
                let subParts = params.split("&");
                subParts = subParts.map(subPart => {
                    if (subPart.startsWith("h=")) {
                        if (subPart !== "h=www%2Emicrosoft%2Ecom") {
                            modified = true;
                        }
                        return "h=www%2Emicrosoft%2Ecom";
                    }
                    else if (subPart.startsWith("r=") && subPart.length > "r=".length) {
                        modified = true;
                        return "r=";
                    }
                    else {
                        return subPart;
                    }
                });
                const modifiedParts = subParts.join("&");
                const combinedResult = `${basePart}?${modifiedParts}`;
                return "URI=" + encodeURIComponentLowerCase(combinedResult);
            }
            else {
                if (basePart.endsWith("/") && options.defaultPath) {
                    basePart = basePart + options.defaultPath;
                }
                if (options.queryParameters === "from-transformation") {
                    // First we will sort alphabetically by key to ensure consistent ordering
                    const sortedEntries = Object.entries(queryParams).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
                    const newParams = sortedEntries.filter(([_, value]) => value !== null).map(([key, value]) => `${key}=${value}`).join("&");
                    const combinedResult = newParams ? `${basePart.toLowerCase()}?${newParams}` : basePart.toLowerCase();
                    if (combinedResult !== content) {
                        modified = true;
                    }
                    return `URI=${encodeURIComponentLowerCase(combinedResult)}`;
                }
                else if (!params) {
                    const lowerCased = content.toLowerCase();
                    if (content !== lowerCased) {
                        modified = true;
                        return `URI=${encodeURIComponentLowerCase(lowerCased)}`;
                    }
                    else {
                        return part;
                    }
                }
                else if (options.queryParameters === "strip" && params) {
                    modified = true;
                    return `URI=${encodeURIComponentLowerCase(basePart.toLowerCase())}`;
                }
                else {
                    return part;
                }
            }

        }
        // Path parameter, which respects the case of the actual URL but must be lowercased to be normalized
        else if (part.startsWith("p=")) {
            if (options.path) {
                const newValue = `p=${options.path}`;
                if (part !== newValue) {
                    modified = true;
                }
                return newValue;
            }
            else {
                const lowerCased = part.toLowerCase();
                if (part !== lowerCased) {
                    modified = true;
                }
                return lowerCased;
            }
        }
        // Referrer parameter, this will be removed to normalize the content
        else if (part.startsWith("r=")) {
            modified = true;
            return null;
        }
        else {
            return part;
        }
    }).filter(part => part !== null);

    if (!modified) {
        return null;
    }
    const replaced = normalizedParams.join(separator);
    return `${baseUrl}?${replaced}`
}

function normalizeTrackingImageUrl(content: Buffer, queryParams: Record<string, string | null>, options: TrackingImageTransformationOptions): Buffer {
    let htmlContent = content.toString("latin1");
    const hasTrackingImage = htmlContent.includes('function footerjs(doc)');
    if (!hasTrackingImage) {
        return content;
    }

    const [, trackingUrl] = htmlContent.match(/<layer visibility="hide"><div style="display:none"><img src="(.+?)"/) ?? [];

    const [, secondaryTrackingUrl] = htmlContent.match(/<layer visibility="hide"><div style="display:none"><img alt="" width="0" height="0" border="0" hspace="0" vspace="0" src="(.+?)">/) ?? [];

    if (!trackingUrl && !secondaryTrackingUrl) {
        return content;
    }

    const normalizedPrimary = trackingUrl ? normalizeUrl(trackingUrl, "&", queryParams, options) : null;
    const normalizedSecondary = secondaryTrackingUrl ? normalizeUrl(secondaryTrackingUrl, "&amp;", queryParams, options) : null;

    if (!normalizedPrimary && !normalizedSecondary) {
        return content;
    }

    if (normalizedPrimary) {
        htmlContent = htmlContent.replace(trackingUrl, normalizedPrimary);
    }
    if (normalizedSecondary) {
        htmlContent = htmlContent.replace(secondaryTrackingUrl, normalizedSecondary);
    }

    return Buffer.from(htmlContent, "latin1");
}

function transformInputs(input: TransformationInput, transformationOptions: Record<string, any>): TransformationOutput[] {
    const normalizedContent = normalizeTrackingImageUrl(input.content, input.queryParams, transformationOptions as TrackingImageTransformationOptions);
    return [{
        content: normalizedContent,
        queryParams: {},
    }];
}

function validateParameters(params: Record<string, any>): boolean {
    Object.keys(params).forEach(key => {
        if (!["path", "queryParameters", "defaultPath"].includes(key)) {
            throw new Error(`TrackingImageTransformation parameters incorrect: Invalid parameter ${key}`);
        }
    });
    Object.entries(params).forEach(([key, value]) => {
        if (key === "queryParameters" && value !== "strip" && value !== "from-transformation") {
            throw new Error(`TrackingImageTransformation parameters incorrect: Invalid value for queryParameters: ${value}`);
        }
        else if ((key === "path" || key === "defaultPath") && typeof value !== "string") {
            throw new Error(`TrackingImageTransformation parameters incorrect: Invalid value for ${key}: ${value}`);
        }
    });
    return true;
}

export const TrackingImageNormalizer = {
    name: "TrackingImageUrlNormalizer",
    normalize: normalizeTrackingImageUrl,
    transform: transformInputs,
    validateParams: validateParameters
} as const;
