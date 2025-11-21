import { DateTime } from "luxon";

export function timestampMin(...timestamps: (string | undefined)[]): string | undefined {
    const validTimestamps = timestamps.filter((ts): ts is string => ts !== undefined && ts.length > 0);
    if (validTimestamps.length === 0) {
        return undefined;
    }
    return validTimestamps.reduce((min, ts) => ts < min ? ts : min);
}

export function timestampMax(...timestamps: (string | undefined)[]): string | undefined {
    const validTimestamps = timestamps.filter((ts): ts is string => ts !== undefined && ts.length > 0);
    if (validTimestamps.length === 0) {
        return undefined;
    }
    return validTimestamps.reduce((max, ts) => ts > max ? ts : max);
}


export function parseHeaderTimestamps(
    headers: Record<string, any>,
    captureTimestamp: string
): {
    lastModified: DateTime<true> | null,
    mementoDate: DateTime<true> | null,
    serverDate: DateTime<true> | null,
    captureDate: DateTime<true>
} {
  let lastModified: DateTime | null = null;
  let mementoDate: DateTime | null = null;
  let serverDate: DateTime | null = null;
  const parseDate = (val: string | undefined): DateTime | null => {
    if (!val) return null;
    const dt = DateTime.fromHTTP(val, { zone: 'utc' });
    return dt.isValid ? dt : null;
  };
  lastModified = parseDate(headers['x-archive-orig-last-modified'] || headers['last-modified']);
  serverDate = parseDate(headers['x-archive-orig-date']);
  mementoDate = parseDate(headers['memento-datetime']);
  const captureDate = DateTime.fromFormat(captureTimestamp, 'yyyyLLddHHmmss', { zone: 'utc' });
  if (!captureDate.isValid) {
      throw new Error(`Invalid capture timestamp format: ${captureTimestamp}`);
  }
  return { lastModified, mementoDate, serverDate, captureDate };
}