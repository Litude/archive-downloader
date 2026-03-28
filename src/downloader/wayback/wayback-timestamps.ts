import { DateTime } from "luxon";

export function parseWaybackHeaderTimestamps(
  headers: Record<string, string>,
  captureTimestamp: string,
): {
  lastModified: DateTime<true> | null;
  mementoDate: DateTime<true> | null;
  serverDate: DateTime<true> | null;
  captureDate: DateTime<true>;
} {
  const parseDate = (val: string | undefined): DateTime | null => {
    if (!val) {
      return null;
    }
    const dt = DateTime.fromHTTP(val, { zone: "utc" });
    return dt.isValid ? dt : null;
  };
  let lastModified = parseDate(headers["x-archive-orig-last-modified"]);
  const serverDate = parseDate(headers["x-archive-orig-date"]);
  const mementoDate = parseDate(headers["memento-datetime"]);
  const captureDate = DateTime.fromFormat(captureTimestamp, "yyyyLLddHHmmss", { zone: "utc" });
  if (!captureDate.isValid) {
    throw new Error(`Invalid capture timestamp format: ${captureTimestamp}`);
  }
  // Sometimes, it seems servers might return last-modified which is the same as date, so it is not a true
  // last-modified. If last-modified is exactly the same as server date, treat it as missing.
  if (lastModified && serverDate && lastModified.toMillis() === serverDate.toMillis()) {
    lastModified = null;
  }
  return { lastModified, mementoDate, serverDate, captureDate };
}