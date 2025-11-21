import { TransformationInput, TransformationOutput } from "../types/transformation-types";

function normalizeTrackingImageUrl(content: Buffer): Buffer {
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
            let subParts = part.split(encodeURIComponent("&"));
            subParts = subParts.map(subPart => {
                if (subPart.startsWith("h%3d")) {
                    if (subPart !== "h%3dwww%252Emicrosoft%252Ecom") {
                        modified = true;
                    }
                    return "h%3dwww%252Emicrosoft%252Ecom";
                }
                else {
                    return subPart;
                }
            })
            return subParts.join(encodeURIComponent("&"));
        }
        else {
            return part;
        }
    })

    if (!modified) {
        return content;
    }
    const replaced = normalizedParams.join("&");
    htmlContent = htmlContent.replace(trackingUrl, `${baseUrl}?${replaced}`);

    return Buffer.from(htmlContent, "latin1");
}

function transformInputs(input: TransformationInput, transformationOptions: Record<string, any>): TransformationOutput[] {
    const normalizedContent = normalizeTrackingImageUrl(input.content);
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
