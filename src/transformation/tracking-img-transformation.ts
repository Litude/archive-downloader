import { TransformationInput, TransformationOutput } from "../types/transformation-types";

export interface TrackingImageTransformationOptions {
  path?: string; // default is to lowercase the path, but can be overridden with a specific value
}

function encodeURIComponentLowerCase(str: string): string {
    return encodeURIComponent(str).replace(/%[0-9a-f]{2}/gi, match => match.toLowerCase());
}

function normalizeTrackingImageUrl(content: Buffer, options: TrackingImageTransformationOptions): Buffer {
    let htmlContent = content.toString("latin1");
    const hasTrackingImage = htmlContent.includes('function footerjs(doc)');
    if (!hasTrackingImage) {
        return content;
    }

    const [, trackingUrl] = htmlContent.match(/<layer visibility="hide"><div style="display:none"><img src="(.+?)"/) ?? [];

    if (!trackingUrl) {
        return content;
    }

    const [baseUrl, params] = trackingUrl.split("?");
    let modified = false;

    const paramParts = params.split("&");
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
                return part;
            }
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
        return content;
    }
    const replaced = normalizedParams.join("&");
    htmlContent = htmlContent.replace(trackingUrl, `${baseUrl}?${replaced}`);

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
