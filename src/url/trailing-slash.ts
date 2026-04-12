export enum TrailingSlashParsingMode {
  Strict, // only match urls where / path matches exactly (i.e. request without slash -> return only urls without slash)
  StrictWithValid, // only match urls where / path matches exactly, but also return 200 captures for urls without slash (workaround for faulty commoncrawl urls...)
  Lax, // don't filter at all based on slash
}

// This assumes captureUrl and requestUrl have the same urlkey already, so Lax does not actually check anything
export function isUrlTrailingSlashMatch(
  captureUrl: string,
  requestUrl: string,
  mode: TrailingSlashParsingMode,
  captureStatusCode?: number,
): boolean {
  if (mode === TrailingSlashParsingMode.Strict) {
    const urlObj1 = new URL(captureUrl);
    const urlObj2 = new URL(requestUrl);
    return urlObj1.pathname.toLowerCase() === urlObj2.pathname.toLowerCase();
  } else if (mode === TrailingSlashParsingMode.StrictWithValid) {
    if (!captureStatusCode) {
      throw new Error("captureStatusCode is required for StrictWithValid mode");
    }
    if (!captureStatusCode.toString().startsWith("2")) {
      return false;
    }
    const urlObj1 = new URL(captureUrl);
    const urlObj2 = new URL(requestUrl);
    const path1 = urlObj1.pathname.toLowerCase();
    const path2 = urlObj2.pathname.toLowerCase();
    return (
      path1 === path2 ||
      (path1.endsWith("/") && path1.slice(0, -1) === path2) ||
      (path2.endsWith("/") && path2.slice(0, -1) === path1)
    );
  } else {
    return true;
  }
}
