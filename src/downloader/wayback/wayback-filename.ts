export function getWaybackFilename(headers: Record<string, string>): string | undefined {
  const waybackFilename = headers["x-archive-src"];
  return waybackFilename;
}
