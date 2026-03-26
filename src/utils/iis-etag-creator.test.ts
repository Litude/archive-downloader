import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { createIisEtagFromDate } from "./iis-etag-creator.js";
import { parseIisEtagDate } from "./iis-etag-parser.js";

function captureAt(iso: string): DateTime<true> {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) throw new Error(`Invalid test date: ${iso}`);
  return dt as DateTime<true>;
}

describe("createIisEtagFromDate", () => {
  it("round-trips through parser with zero nanoseconds", () => {
    const date = "1999-01-03T09:06:58.000000000Z";
    const etag = createIisEtagFromDate(date, 0x7f6);
    const parsed = parseIisEtagDate(etag, captureAt("2000-05-19T20:22:13Z"));
    expect(parsed).not.toBeNull();
    expect(parsed).toContain(date);
  });

  it("round-trips through parser with sub-second precision", () => {
    const date = "1999-11-09T16:49:08.123456700Z";
    const etag = createIisEtagFromDate(date, 0x7ed);
    const parsed = parseIisEtagDate(etag, captureAt("2000-01-01T00:00:00Z"));
    expect(parsed).not.toBeNull();
    expect(parsed).toContain(date);
  });

  it("includes change number in hex", () => {
    const etag = createIisEtagFromDate("1999-01-03T09:06:58.000000000Z", 0x7f6);
    expect(etag).toMatch(/:7f6"$/);
  });

  it("wraps in double quotes", () => {
    const etag = createIisEtagFromDate("1999-01-03T09:06:58.000000000Z");
    expect(etag).toMatch(/^".*"$/);
  });

  it("uses change number 0 by default", () => {
    const etag = createIisEtagFromDate("1999-01-03T09:06:58.000000000Z");
    expect(etag).toMatch(/:0"$/);
  });

  it("throws on invalid date format", () => {
    expect(() => createIisEtagFromDate("1999-01-03T09:06:58Z")).toThrow();
    expect(() => createIisEtagFromDate("not a date")).toThrow();
  });
});
