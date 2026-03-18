import JSON5 from 'json5';
import fs from 'fs';
import path from 'path';
import { CaptureClassification } from '../types/capture-types';

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
`.toLowerCase().trim();
}

function decodeHtml(buffer: Buffer): string {
  let encoding = "windows-1252";
  const preview = new TextDecoder(encoding).decode(buffer.subarray(0, 2048));

  // These are not all standard ways, but the purpose is to detect the encoding in the best way possible, so non-standard ways are fine
  const match = preview.match(/<meta\s+charset=["']?([^"'>\s]+)/i)
             || preview.match(/<meta\s+http-equiv=["']?Content-Type["']?\s+content=["'][^"']*charset=([^"'>\s]+)/i)
             || preview.match(/<meta\s+name=["']?charset["']?\s+content=["'][^"']*charset=([^"'>\s]+)/i)
             || preview.match(/<meta\s+name=["']?charset["']?\s+content=["']?([^"'>\s]+)/i)
  if (match) {
    encoding = match[1];
  }
  return new TextDecoder(encoding).decode(buffer);
}

export function classifyEntryWithConfig(
    url: string,
    sha256: string,
    mimetype: string,
    content: Buffer,
    downloadClassification: "corrupt" | "unavailable" | undefined,
    statusCode: number,
    classificationOverrides: Record<string, CaptureClassification> | undefined,
    config: ClassifierConfig
): CaptureClassification {
  if (classificationOverrides && classificationOverrides[sha256]) {
    return classificationOverrides[sha256];
  }
  if (downloadClassification === "corrupt" || (statusCode === 200 && content.length === 0)) {
    return "corrupt";
  }
  else if (downloadClassification === "unavailable") {
    return "unavailable";
  }
  else if (statusCode === 404) {
    return "not_found";
  }
  else if ([301, 302, 307, 308].includes(statusCode)) {
    return "redirect";
  }
  else if (config.transientRedirectSha256.includes(sha256)) {
    return "transient_retry";
  }
  else if (mimetype.toLowerCase().includes('html')) {
    const text = decodeHtml(content).toLowerCase();
    if (config.notFoundStrings.some(s => text.includes(s)) || config.notFoundSha256.includes(sha256)) {
      return "not_found";
    }
    
    const invalidRedirectPage = generateInvalidRedirectPage(url);
    if (text.trim().replaceAll('\r', '') === invalidRedirectPage) {
      return "transient_retry";
    }
  }
  // This is last because sometimes not found pages have returned 403 error codes but they will de detected by the not found string detection
  if (statusCode === 403) {
    return "forbidden";
  }

  return "ok";
}

export function classifyEntry(
    url: string,
    sha256: string,
    mimetype: string,
    content: Buffer,
    downloadClassification: "corrupt" | "unavailable" | undefined,
    statusCode: number,
    classificationOverrides?: Record<string, CaptureClassification>
): CaptureClassification {
  const config = loadDefaultConfig();
  return classifyEntryWithConfig(url, sha256, mimetype, content, downloadClassification, statusCode, classificationOverrides, config);
}

let defaultConfig : ClassifierConfig | null = null;
function loadDefaultConfig(): ClassifierConfig {
  if (defaultConfig !== null) {
    return defaultConfig;
  }
  defaultConfig = {
    notFoundStrings: JSON5.parse(fs.readFileSync(path.join(__dirname, '../../data/settings/not_found_strings.json'), 'utf-8')).map((s: string) => s.toLowerCase()),
    notFoundSha256: JSON5.parse(fs.readFileSync(path.join(__dirname, '../../data/settings/not_found_sha256.json'), 'utf-8')),
    transientRedirectSha256: JSON5.parse(fs.readFileSync(path.join(__dirname, '../../data/settings/transient_redirect_sha256.json'), 'utf-8'))
  };
  return defaultConfig;
}
