import { TransformationInput, TransformationOutput } from "../types/transformation-types";

export interface TrackingImageTransformationOptions {
  path?: string; // default is to lowercase the path, but can be overridden with a specific value
  stripQueryParameters?: boolean; // default is false, if true will remove all query parameters to normalize the URL
}

function encodeURIComponentLowerCase(str: string): string {
    return encodeURIComponent(str).replace(/%[0-9a-f]{2}/gi, match => match.toLowerCase());
}

function normalizeUrl(trackingUrl: string, separator: string, options: TrackingImageTransformationOptions) {
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
            const [basePart, params] = content.split("?");
            if (!params) {
                const lowerCased = content.toLowerCase();
                if (content !== lowerCased) {
                    modified = true;
                    return `URI=${encodeURIComponentLowerCase(lowerCased)}`;
                }
                else {
                    return part;
                }
            }
            let subParts = params.split("&");
            // Complex URI means that the URI param consists of subparams where the actual url is in a subparam (h=domain and u=path)
            // Else the URI is just the actual URL of the page (excluding hostname) including query params
            const isComplexUri = basePart === "/library/toolbar/3.0/asp.aspx";
            if (isComplexUri) {
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
                if (options.stripQueryParameters && params) {
                    modified = true;
                    return `URI=${encodeURIComponentLowerCase(basePart)}`;
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

function normalizeTrackingImageUrl(content: Buffer, options: TrackingImageTransformationOptions): Buffer {
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

    const normalizedPrimary = trackingUrl ? normalizeUrl(trackingUrl, "&", options) : null;
    const normalizedSecondary = secondaryTrackingUrl ? normalizeUrl(secondaryTrackingUrl, "&amp;", options) : null;

    if (!normalizedPrimary && !normalizedSecondary) {
        return content;
    }

    if (normalizedPrimary) {
        htmlContent = htmlContent.replace(trackingUrl, normalizedPrimary);
    }
    if (normalizedSecondary && secondaryTrackingUrl) {
        htmlContent = htmlContent.replace(secondaryTrackingUrl, normalizedSecondary);
    }

    return Buffer.from(htmlContent, "latin1");
}

function transformInputs(input: TransformationInput, transformationOptions: Record<string, any>): TransformationOutput[] {
    const normalizedContent = normalizeTrackingImageUrl(input.content, transformationOptions as TrackingImageTransformationOptions);
    return [{
        content: normalizedContent,
        queryParams: {},
    }];
}

function validateParameters(params: Record<string, any>): boolean {
    return true;
}

export const TrackingImageNormalizer = {
    name: "TrackingImageUrlNormalizer",
    normalize: normalizeTrackingImageUrl,
    transform: transformInputs,
    validateParams: validateParameters
} as const;
