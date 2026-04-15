import { RawHeader } from "../../headers/raw-header-parser.js";
import { CaptureEntry } from "../../types/capture-types.js";

export function deriveRefererFromMicrosoftTrackingImage(
  captureEntry: CaptureEntry,
): RawHeader[] | undefined {
  const content = captureEntry.content;
  if (!content || captureEntry.mimetype !== "text/html") {
    return undefined;
  }
  const htmlContent = content.toString("latin1");

  const [, trackingUrl] =
    htmlContent.match(/<layer visibility="hide"><div style="display:none"><img src="(.+?)"/) ?? [];

  const [, secondaryTrackingUrl] =
    htmlContent.match(
      /<layer visibility="hide"><div style="display:none"><img alt="" width="0" height="0" border="0" hspace="0" vspace="0" src="(.+?)">/,
    ) ?? [];

  if (!trackingUrl && !secondaryTrackingUrl) {
    return undefined;
  }

  const mainUrl = trackingUrl ? extractMicrosoftTrackingUrl(trackingUrl, "&") : null;
  const secondaryUrl = secondaryTrackingUrl
    ? extractMicrosoftTrackingUrl(secondaryTrackingUrl, "&amp;")
    : null;

  if (!mainUrl?.length && !secondaryUrl?.length) {
    return undefined;
  }

  const allUrls = [...(mainUrl ?? []), ...(secondaryUrl ?? [])];
  const uniqueUrls = new Set(allUrls);
  if (uniqueUrls.size > 1) {
    throw new Error(
      `${captureEntry.timestamp}-${captureEntry.url}: Inconsistent tracking URLs found in content: ${[...uniqueUrls].join(", ")}`,
    );
  }
  const finalUrl = allUrls[0];
  if (finalUrl) {
    return [["Referer", finalUrl, "?"]];
  }
  return undefined;
}

function extractMicrosoftTrackingUrl(trackingUrl: string, separator: string): string[] | null {
  const [, params] = trackingUrl.split("?");
  const resultUrls: string[] = [];
  const paramParts = params.split(separator);
  paramParts.forEach((part) => {
    if (part.startsWith("URI=")) {
      const content = decodeURIComponent(part.substring("URI=".length));
      const splitContent = content.split("?");
      const basePart = splitContent[0];
      const params = splitContent[1];
      // Complex URI means that the URI param consists of subparams where the actual url is in a subparam (h=domain and u=path)
      // Else the URI is just the actual URL of the page (excluding hostname) including query params
      const isComplexUri = basePart === "/library/toolbar/3.0/asp.aspx";
      if (isComplexUri && params) {
        const subParts = params.split("&");
        subParts.forEach((subPart) => {
          if (subPart.startsWith("r=") && subPart.length > "r=".length) {
            resultUrls.push(decodeURIComponent(subPart.substring("r=".length)));
          }
        });
      }
    }
    // Referrer parameter, this will be removed to normalize the content
    else if (part.startsWith("r=")) {
      resultUrls.push(decodeURIComponent(part.substring("r=".length)));
    }
  });
  return resultUrls.length ? resultUrls : null;
}
