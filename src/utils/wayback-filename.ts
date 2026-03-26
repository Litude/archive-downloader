export function getWaybackFilename(headers: Record<string, any>): string | undefined {
  const waybackFilename = headers["x-archive-src"];
  return waybackFilename;
}
