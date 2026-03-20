export type RawHeader = [string, string];

export function parseRawHeadersToPairs(rawHeaders: string | string[]): RawHeader[] {
  const headerPairs: RawHeader[] = [];
  if (Array.isArray(rawHeaders)) {
    for (let i = 0; i < rawHeaders.length; i += 2) {
      headerPairs.push([rawHeaders[i], rawHeaders[i + 1]]);
    }
  }
  return headerPairs;
}

export function parseArchiveRecordHeadersToPairs(recordHeaders: string[]): RawHeader[] {
  const headerPairs: RawHeader[] = [];
  for (const headerLine of recordHeaders) {
    const separatorIndex = headerLine.indexOf(':');
    if (separatorIndex > -1) {
      const name = headerLine.substring(0, separatorIndex).trim();
      const value = headerLine.substring(separatorIndex + 1).trim();
      headerPairs.push([name, value]);
    }
  }
  return headerPairs;
}
