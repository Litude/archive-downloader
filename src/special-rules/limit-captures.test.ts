import { describe, it, expect } from "vitest";
import { ExtendedCdxEntry } from "../types/wayback-types.js";
import { LimitedCaptureRange } from "../types/download-input-types.js";
import { filterLimitedCapturesForUrl, selectByClockTime, selectByIndex } from "./limit-captures.js";

function makeCdx(timestamp: string): ExtendedCdxEntry {
  return {
    urlkey: "com,example)/",
    timestamp,
    url: "http://example.com/",
    status: 200,
    digest: "ABC123",
    mimetype: "text/html",
    length: 100,
    source: "superarchive",
    requestUrl: "http://example.com/",
  };
}

/** Generate captures for a single day at every hour (HH:00:00). */
function makeHourlyCaptures(datePrefix: string): ExtendedCdxEntry[] {
  const captures: ExtendedCdxEntry[] = [];
  for (let h = 0; h < 24; h++) {
    captures.push(makeCdx(`${datePrefix}${String(h).padStart(2, "0")}0000`));
  }
  return captures;
}

/**
 * Generate many captures for a single day (every 10 minutes = 144 captures).
 */
function makeDenseCaptures(datePrefix: string): ExtendedCdxEntry[] {
  const captures: ExtendedCdxEntry[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      captures.push(
        makeCdx(`${datePrefix}${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`),
      );
    }
  }
  return captures;
}

const range: LimitedCaptureRange = {
  startTimestamp: "20001001000000",
  endTimestamp: "20001001235959",
  capturesPerDay: 12,
};

describe("selectByClockTime", () => {
  it("picks 12 captures closest to target clock times (1,3,5,...,23)", () => {
    const captures = makeHourlyCaptures("20001001");
    const result = selectByClockTime(captures, 12);

    expect(result).toHaveLength(12);
    const hours = result.map((s) => parseInt(s.timestamp.slice(8, 10)));
    // interval = 2h, targets at minute 60,180,300,...,1380 => hours 1,3,5,...,23
    expect(hours).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
  });

  it("deduplicates when multiple targets map to the same capture", () => {
    // Only 3 captures but requesting 12 — all targets will converge on these 3
    const captures = [
      makeCdx("20001001000000"),
      makeCdx("20001001120000"),
      makeCdx("20001001230000"),
    ];
    const result = selectByClockTime(captures, 12);
    expect(result.length).toBeLessThanOrEqual(3);
    // All selected are unique
    const timestamps = result.map((s) => s.timestamp);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("works with capturesPerDay that does not divide 24 evenly", () => {
    const captures = makeDenseCaptures("20001001"); // 144 captures, every 10 min
    const result = selectByClockTime(captures, 7);
    expect(result.length).toBeLessThanOrEqual(7);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Check uniqueness
    const timestamps = result.map((s) => s.timestamp);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("picks 1 capture for capturesPerDay=1 (closest to noon)", () => {
    const captures = makeHourlyCaptures("20001001");
    const result = selectByClockTime(captures, 1);
    expect(result).toHaveLength(1);
    // target = 12*60 = 720 minutes = 12:00, closest is hour 12
    expect(result[0].timestamp).toBe("20001001120000");
  });
});

describe("selectByIndex", () => {
  it("picks evenly spaced captures by index", () => {
    // 10 captures, pick 3 → indices 0, 5 (4.5 rounds to 5), 9
    const captures: ExtendedCdxEntry[] = [];
    for (let i = 0; i < 10; i++) {
      captures.push(makeCdx(`2000100100${String(i).padStart(2, "0")}00`));
    }
    const result = selectByIndex(captures, 3);
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe("20001001000000");
    expect(result[2].timestamp).toBe("20001001000900");
  });

  it("returns all captures when capturesPerDay >= count", () => {
    const captures = [makeCdx("20001001010000"), makeCdx("20001001020000")];
    const result = selectByIndex(captures, 5);
    expect(result).toHaveLength(2);
  });

  it("returns single capture for capturesPerDay=1", () => {
    const captures = [
      makeCdx("20001001010000"),
      makeCdx("20001001120000"),
      makeCdx("20001001230000"),
    ];
    const result = selectByIndex(captures, 1);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe("20001001010000");
  });

  it("returns empty for empty input", () => {
    expect(selectByIndex([], 5)).toEqual([]);
  });
});

describe("filterLimitedCapturesForUrl", () => {
  it("returns all snapshots when limitedCaptures is empty", () => {
    const snaps = [makeCdx("20001001010000"), makeCdx("20001001020000")];
    const result = filterLimitedCapturesForUrl(snaps, []);
    expect(result).toEqual(snaps);
  });

  it("keeps all captures on a day with fewer captures than capturesPerDay", () => {
    const snaps = [makeCdx("20001001010000"), makeCdx("20001001120000")];
    const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 12 }]);
    expect(result).toHaveLength(2);
  });

  // This rule is disabled for now
  // it('uses index-based spacing when captures are moderate (> N but <= N*10)', () => {
  //     // 15 captures on one day, capturesPerDay=3 → 15 > 3 but 15 <= 30 → index-based
  //     const snaps: CdxEntry[] = [];
  //     for (let i = 0; i < 15; i++) {
  //         const h = String(i + 1).padStart(2, '0');
  //         snaps.push(makeCdx(`20001001${h}0000`));
  //     }
  //     const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 3 }]);
  //     expect(result).toHaveLength(3);
  //     // Index spacing: indices 0, 7, 14 → hours 01, 08, 15
  //     expect(result[0].timestamp).toBe('20001001010000');
  //     expect(result[1].timestamp).toBe('20001001080000');
  //     expect(result[2].timestamp).toBe('20001001150000');
  // });

  it("uses clock-time matching when captures are dense (> N*10)", () => {
    // 144 captures (every 10 min), capturesPerDay=12 → 144 > 120 → clock-time
    const snaps = makeDenseCaptures("20001001");
    const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 12 }]);
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Verify all timestamps are unique
    const timestamps = result.map((s) => s.timestamp);
    expect(new Set(timestamps).size).toBe(timestamps.length);
    // Verify sorted
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestamp >= result[i - 1].timestamp).toBe(true);
    }
  });

  it("preserves captures outside the limited range", () => {
    const outsideBefore = makeCdx("20000901120000");
    const outsideAfter = makeCdx("20001101120000");
    const insideCaptures = makeHourlyCaptures("20001001");
    const snaps = [outsideBefore, ...insideCaptures, outsideAfter];

    const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 3 }]);

    // Outside captures must be present
    expect(result.some((s) => s.timestamp === "20000901120000")).toBe(true);
    expect(result.some((s) => s.timestamp === "20001101120000")).toBe(true);
    // Inside captures should be limited
    const insideResults = result.filter(
      (s) => s.timestamp >= range.startTimestamp && s.timestamp <= range.endTimestamp,
    );
    expect(insideResults).toHaveLength(3);
  });

  it("handles multiple days, each deciding algorithm independently", () => {
    // Day 1: 5 captures, capturesPerDay=3 → 5 > 3 and 5 <= 30 → index-based (picks 3)
    // Day 2: 2 captures, capturesPerDay=3 → 2 <= 3 → keep all (2)
    const day1: ExtendedCdxEntry[] = [];
    for (let i = 0; i < 5; i++) {
      day1.push(makeCdx(`20001001${String(i * 4).padStart(2, "0")}0000`));
    }
    const day2 = [makeCdx("20001002060000"), makeCdx("20001002180000")];
    const snaps = [...day1, ...day2];

    const multiDayRange: LimitedCaptureRange = {
      startTimestamp: "20001001000000",
      endTimestamp: "20001002235959",
      capturesPerDay: 3,
    };

    const result = filterLimitedCapturesForUrl(snaps, [multiDayRange]);
    // Day 1 → 3 captures (index-based from 5)
    const day1Results = result.filter((s) => s.timestamp.startsWith("20001001"));
    expect(day1Results).toHaveLength(3);
    // Day 2 → 2 captures (all kept)
    const day2Results = result.filter((s) => s.timestamp.startsWith("20001002"));
    expect(day2Results).toHaveLength(2);
  });

  it("result is always sorted by timestamp", () => {
    const snaps = [
      makeCdx("20001001230000"),
      makeCdx("20001001010000"),
      makeCdx("20001001120000"),
      makeCdx("20000901050000"),
    ];
    const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 2 }]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestamp >= result[i - 1].timestamp).toBe(true);
    }
  });

  it("excludes non-200 captures within the limited range", () => {
    const snaps = [
      makeCdx("20001001030000"),
      { ...makeCdx("20001001060000"), status: 302 },
      { ...makeCdx("20001001090000"), status: 404 },
      makeCdx("20001001120000"),
      makeCdx("20001001180000"),
    ];
    const result = filterLimitedCapturesForUrl(snaps, [{ ...range, capturesPerDay: 12 }]);
    // Only the 3 captures with status 200 should remain
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.status === 200)).toBe(true);
  });
});
