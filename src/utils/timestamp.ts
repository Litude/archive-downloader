import { DateTime } from "luxon";

export function timestampMin(...timestamps: (string | undefined)[]): string | undefined {
  const validTimestamps = timestamps.filter(
    (ts): ts is string => ts !== undefined && ts.length > 0,
  );
  if (validTimestamps.length === 0) {
    return undefined;
  }
  return validTimestamps.reduce((min, ts) => (ts < min ? ts : min));
}

export function timestampMax(...timestamps: (string | undefined)[]): string | undefined {
  const validTimestamps = timestamps.filter(
    (ts): ts is string => ts !== undefined && ts.length > 0,
  );
  if (validTimestamps.length === 0) {
    return undefined;
  }
  return validTimestamps.reduce((max, ts) => (ts > max ? ts : max));
}

export function sanityCheckTimestamps({
  url,
  lastModified,
  mementoDate,
  serverDate,
  captureDate,
}: {
  url: string;
  lastModified: DateTime<true> | null;
  mementoDate?: DateTime<true> | null;
  serverDate: DateTime<true> | null;
  captureDate: DateTime<true>;
}) {
  if (lastModified && lastModified.diff(captureDate).as("hours") > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: last-modified ${lastModified.toISO()} is more than 1 hour newer than capture date ${captureDate.toISO()}`,
    );
  }
  if (mementoDate && Math.abs(mementoDate.diff(captureDate).as("hours")) > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: memento-datetime ${mementoDate.toISO()} is more than 1 hour different from capture date ${captureDate.toISO()}`,
    );
  } else if (mementoDate && !mementoDate?.equals(captureDate)) {
    console.warn(
      `Warning: Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} memento-datetime ${mementoDate?.toISO()} is different from capture date ${captureDate.toISO()}`,
    );
  }
  if (serverDate && Math.abs(serverDate.diff(captureDate).as("months")) > 1) {
    throw new Error(
      `Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: server date ${serverDate.toISO()} is more than 1 month different from capture date ${captureDate.toISO()}`,
    );
  }
}
