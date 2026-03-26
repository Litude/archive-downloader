import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { getMostLikelyEtagDate, parseIisEtagDate } from "./iis-etag-parser.js";

function captureAt(iso: string): DateTime<true> {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) throw new Error(`Invalid test date: ${iso}`);
  return dt as DateTime<true>;
}

describe("parseIisEtagDate", () => {
  // Real-world paired data from archive headers (IIS/5.0 servers)

  it("parses agexonzone.gif etag (Last-Modified: 1999-01-03T09:06:58Z)", () => {
    // ETag: "065876af836be1:7f6", Last-Modified: Sun, 03 Jan 1999 09:06:58 GMT
    const result = parseIisEtagDate(
      '"065876af836be1:7f6"',
      captureAt("2000-05-19T20:22:13Z"),
    );
    expect(result).not.toBeNull();
    // Should be within ~2 seconds of 1999-01-03T09:06:58Z
    expect(result!.some(result => result.startsWith("1999-01-03T09:06:"))).toBe(true);
  });

  it("returns all possible values if multiple - parses ensemble_logo.gif etag (Last-Modified: 1999-01-03T10:34:20Z)", () => {
    // ETag: "01e19f437be1:43a8", Last-Modified: Sun, 03 Jan 1999 10:34:20 GMT
    const result = parseIisEtagDate(
      '"01e19f437be1:43a8"',
      captureAt("2000-07-28T18:01:57Z"),
    );
    expect(result).not.toBeNull();
    expect(result!.some(result => result.startsWith("1999-01-03T10:34:"))).toBe(true);
  });

  it("returns all possible values if multiple - parses ensemble_logo.gif etag (Last-Modified: 1999-01-03T10:34:20Z)", () => {
    // ETag: "01e19f437be1:43a8", Last-Modified: Sun, 03 Jan 1999 10:34:20 GMT
    const result = getMostLikelyEtagDate(
      '"01e19f437be1:43a8"',
      captureAt("2000-07-28T18:01:57Z"),
      captureAt("1999-01-03T10:34:20Z"),
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result[0].startsWith("1999-01-03T10:34:")).toBe(true);
    }
  });

  it("parses trans.gif etag (Last-Modified: 1999-01-07T03:55:00Z)", () => {
    // ETag: "042627ff139be1:7f6", Last-Modified: Thu, 07 Jan 1999 03:55:00 GMT
    const result = parseIisEtagDate(
      '"042627ff139be1:7f6"',
      captureAt("2000-05-19T06:21:50Z"),
    );
    expect(result).not.toBeNull();
    expect(result!.some(result => result.startsWith("1999-01-07T03:55:"))).toBe(true);
  });

  it("parses user example 1 (Last-Modified: 1999-11-09T16:49:08Z)", () => {
    // ETag: "ba9d5657d22abf1:7ed", Last-Modified: Tue, 09 Nov 1999 16:49:08 GMT
    const result = parseIisEtagDate(
      '"ba9d5657d22abf1:7ed"',
      captureAt("2000-01-01T00:00:00Z"),
    );
    expect(result).not.toBeNull();
    expect(result!.some(result => result.startsWith("1999-11-09T16:49:"))).toBe(true);
  });

  it("parses user example 2 (Last-Modified: 1999-12-21T15:24:34Z)", () => {
    // ETag: "fe53497cc74bbf1:9b5e7", Last-Modified: Tue, 21 Dec 1999 15:24:34 GMT
    const result = parseIisEtagDate(
      '"fe53497cc74bbf1:9b5e7"',
      captureAt("2000-01-01T00:00:00Z"),
    );
    expect(result).not.toBeNull();
    expect(result!.some(result => result.startsWith("1999-12-21T15:24:"))).toBe(true);
  });

  // Nanosecond precision

  it("preserves nanosecond precision", () => {
    const result = parseIisEtagDate(
      '"065876af836be1:7f6"',
      captureAt("2000-05-19T20:22:13Z"),
    );
    expect(result).not.toBeNull();
    // Format: YYYY-MM-DDTHH:mm:ss.uuuuuuuuuZ
    result?.forEach(result => {
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/);
    });
  });

  // Same file, different change numbers — same timestamp portion

  it("returns same timestamp for same file with different change numbers", () => {
    const capture = captureAt("2001-01-01T00:00:00Z");
    const [result1] = parseIisEtagDate('"065876af836be1:7f6"', capture) ?? [];
    const [result2] = parseIisEtagDate('"065876af836be1:6f928"', capture) ?? [];
    const [result3] = parseIisEtagDate('"065876af836be1:86f"', capture) ?? [];
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  // Edge cases

  it("returns null for non-IIS etag format", () => {
    const capture = captureAt("2000-01-01T00:00:00Z");
    expect(parseIisEtagDate('"abc123"', capture)).toBeNull();
    expect(parseIisEtagDate('W/"abc:123"', capture)).toBeNull();
    expect(parseIisEtagDate("", capture)).toBeNull();
  });

  it("returns null for hex string too short or too long", () => {
    const capture = captureAt("2000-01-01T00:00:00Z");
    expect(parseIisEtagDate('"abcdef:1"', capture)).toBeNull(); // 6 chars, need ≥8
    expect(parseIisEtagDate('"12345678901234567:1"', capture)).toBeNull(); // 17 chars, need ≤16
  });

  it("handles etag without surrounding quotes", () => {
    const result = parseIisEtagDate(
      "065876af836be1:7f6",
      captureAt("2000-05-19T20:22:13Z"),
    );
    expect(result).not.toBeNull();
    expect(result!.some(result => result.startsWith("1999-01-03T09:06:"))).toBe(true);
  });
});
