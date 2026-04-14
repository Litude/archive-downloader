import JSON5 from "json5";
import fs from "fs";
import path, { dirname } from "path";
import { CaptureClassification, Classification } from "../types/capture-types.js";
import { DownloadedFile } from "../types/download-types.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ClassifierConfig {
  notFoundStrings: string[];
  notFoundSha256: string[];
  transientRedirectSha256: string[];
}

function generateInvalidRedirectPage(url: string) {
  const parsedUrl = new URL(url).pathname;
  return `
<HTML><HEAD><META HTTP-EQUIV="Refresh" CONTENT="0.1; URL=${parsedUrl}">
<META HTTP-EQUIV="Pragma" CONTENT="no cache">
<META HTTP-EQUIV="Expires" CONTENT="-1">
</HEAD></HTML>
`
    .toLowerCase()
    .trim();
}

function decodeHtml(buffer: Buffer): string {
  let encoding = "windows-1252";
  const preview = new TextDecoder(encoding).decode(buffer.subarray(0, 2048));

  // These are not all standard ways, but the purpose is to detect the encoding in the best way possible, so non-standard ways are fine
  const match =
    preview.match(/<meta\s+charset=["']?([^"'>\s]+)/i) ||
    preview.match(
      /<meta\s+http-equiv=["']?Content-Type["']?\s+content=["'][^"']*charset=([^"'>\s]+)/i,
    ) ||
    preview.match(/<meta\s+name=["']?charset["']?\s+content=["'][^"']*charset=([^"'>\s]+)/i) ||
    preview.match(/<meta\s+name=["']?charset["']?\s+content=["']?([^"'>\s]+)/i);
  if (match) {
    encoding = match[1];
  }
  return new TextDecoder(encoding).decode(buffer);
}

export function classifyEntryWithConfig(
  url: string,
  sha256: string,
  mimetype: string | undefined,
  content: Buffer,
  downloadClassification: "corrupt" | "unavailable" | undefined,
  downloadMetadata: DownloadedFile["metadata"] | undefined,
  statusCode: number,
  classificationOverrides: Record<string, CaptureClassification> | undefined,
  config: ClassifierConfig,
): Classification {
  if (classificationOverrides && classificationOverrides[sha256]) {
    return { type: classificationOverrides[sha256] };
  }
  if (downloadClassification === "corrupt") {
    if (downloadMetadata?.downloadErrorDetails) {
      return {
        type: "corrupt",
        details: {
          reason: downloadMetadata.downloadErrorDetails.reason,
          downloadedSize: downloadMetadata.downloadErrorDetails.downloadedSize,
          actualSize: downloadMetadata.downloadErrorDetails.actualSize,
        },
      };
    } else {
      return { type: "corrupt" };
    }
  }

  if (statusCode === 200 && content.length === 0) {
    return { type: "corrupt", details: { reason: "empty_content" } };
  } else if (downloadClassification === "unavailable") {
    return { type: "unavailable" };
  } else if (statusCode === 400) {
    return { type: "bad_request" };
  } else if (statusCode === 404) {
    return { type: "not_found" };
  } else if ([301, 302, 307, 308].includes(statusCode)) {
    return { type: "redirect" };
  } else if (config.transientRedirectSha256.includes(sha256)) {
    return { type: "transient_retry" };
  } else if (mimetype && mimetype.toLowerCase().includes("html")) {
    const text = decodeHtml(content).toLowerCase();
    if (
      config.notFoundStrings.some((s) => text.includes(s)) ||
      config.notFoundSha256.includes(sha256)
    ) {
      return { type: "not_found", details: { reason: "not_found_string_detected" } };
    }

    const invalidRedirectPage = generateInvalidRedirectPage(url);
    if (text.trim().replaceAll("\r", "") === invalidRedirectPage) {
      return { type: "transient_retry" };
    }
  }
  // This is last because sometimes not found pages have returned 403 error codes but they will be detected by the not found string detection
  if (statusCode === 403) {
    return { type: "forbidden" };
  }

  return { type: "ok" };
}

export function classifyEntry(
  url: string,
  sha256: string,
  mimetype: string | undefined,
  content: Buffer,
  downloadClassification: "corrupt" | "unavailable" | undefined,
  downloadMetadata: DownloadedFile["metadata"] | undefined,
  statusCode: number,
  classificationOverrides?: Record<string, CaptureClassification>,
): Classification {
  const config = loadDefaultConfig();
  return classifyEntryWithConfig(
    url,
    sha256,
    mimetype,
    content,
    downloadClassification,
    downloadMetadata,
    statusCode,
    classificationOverrides,
    config,
  );
}

let defaultConfig: ClassifierConfig | null = null;
function loadDefaultConfig(): ClassifierConfig {
  if (defaultConfig !== null) {
    return defaultConfig;
  }
  defaultConfig = {
    notFoundStrings: JSON5.parse(
      fs.readFileSync(path.join(__dirname, "../../data/settings/not_found_strings.json"), "utf-8"),
    ).map((s: string) => s.toLowerCase()),
    notFoundSha256: JSON5.parse(
      fs.readFileSync(path.join(__dirname, "../../data/settings/not_found_sha256.json"), "utf-8"),
    ),
    transientRedirectSha256: JSON5.parse(
      fs.readFileSync(
        path.join(__dirname, "../../data/settings/transient_redirect_sha256.json"),
        "utf-8",
      ),
    ),
  };
  return defaultConfig;
}
