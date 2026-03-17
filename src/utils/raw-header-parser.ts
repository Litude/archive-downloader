export type RawHeader = [string, string];

export function parseRawHeadersToPairs(rawHeaders: string | string[]): [string, string][] {
  const headerPairs: [string, string][] = [];
  if (Array.isArray(rawHeaders)) {
    for (let i = 0; i < rawHeaders.length; i += 2) {
      headerPairs.push([rawHeaders[i], rawHeaders[i + 1]]);
    }
  }
  return headerPairs;
}
