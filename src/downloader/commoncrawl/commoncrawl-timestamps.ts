import { DateTime } from "luxon";

export function parseCommonCrawlTimestamps(
  headers: Record<string, string>,
  captureTimestamp: string,
): {
  lastModified: DateTime<true> | null;
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
  const lastModified = parseDate(headers["last-modified"]);
  const serverDate = parseDate(headers["date"]);
  const captureDate = DateTime.fromFormat(captureTimestamp, "yyyyLLddHHmmss", { zone: "utc" });
  if (!captureDate.isValid) {
    throw new Error(`Invalid capture timestamp format: ${captureTimestamp}`);
  }
  return { lastModified, serverDate, captureDate };
}
