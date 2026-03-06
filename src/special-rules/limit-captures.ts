import JSON5 from "json5";
import fs from "fs";
import path from "path";
import { DateTime } from "luxon";
import { LimitedCaptureRange, UrlEntry } from "../types/download-input-types";
import { CdxEntry } from "../types/wayback-types";

let defaultLimitedCaptures: string[] | null = null;
function loadDefaultLimitedCaptureUrls(): string[] {
  if (defaultLimitedCaptures !== null) {
    return defaultLimitedCaptures;
  }
  const limitedCaptureUrls: string[] = JSON5.parse(
    fs.readFileSync(
        path.join(__dirname, '../../data/settings/limited_capture_urls.json'), 'utf-8'
    )
);
  defaultLimitedCaptures = limitedCaptureUrls;
  return limitedCaptureUrls;
}

export function checkForLimitedCaptureUrlWithConfig(url: string, limitedCaptureUrls: string[]): LimitedCaptureRange | null {
    const isLimited = limitedCaptureUrls.some((limitedUrl) =>
        limitedUrl.startsWith('/') ? new URL(url).pathname === limitedUrl : url === limitedUrl
    );
    if (isLimited) {
        return {
            url,
            startTimestamp: "20000727000000",
            endTimestamp: "20001013235959",
            capturesPerDay: 3,
            
        };
    } else {
        return null;
    }
}

export function checkForLimitedCaptureUrl(url: string) {
    const defaultLimitedCaptureUrls = loadDefaultLimitedCaptureUrls();
    return checkForLimitedCaptureUrlWithConfig(url, defaultLimitedCaptureUrls);
}


// This is set to 0 to force clock based capture selection for now
const THRESHOLD_MULTIPLIER = 0;

/**
 * Given a day's captures (sorted) and a target capturesPerDay, pick captures
 * closest to evenly-spaced clock times (UTC). Target times are offset by
 * half an interval so spacing stays even across day boundaries.
 */
export function selectByClockTime(dayCapturesSorted: CdxEntry[], capturesPerDay: number): CdxEntry[] {
    const intervalMinutes = (24 * 60) / capturesPerDay;
    const targetMinutes: number[] = [];
    for (let i = 0; i < capturesPerDay; i++) {
        targetMinutes.push(intervalMinutes / 2 + i * intervalMinutes);
    }

    const selected = new Set<CdxEntry>();
    for (const target of targetMinutes) {
        let best: CdxEntry | null = null;
        let bestDist = Infinity;
        for (const snap of dayCapturesSorted) {
            const dt = DateTime.fromFormat(snap.timestamp, 'yyyyMMddHHmmss', { zone: 'utc' });
            const minuteOfDay = dt.hour * 60 + dt.minute;
            const dist = Math.abs(minuteOfDay - target);
            if (dist < bestDist) {
                bestDist = dist;
                best = snap;
            }
        }
        if (best) {
            selected.add(best);
        }
    }
    return [...selected];
}

/**
 * Given a day's captures (sorted) and a target capturesPerDay, pick captures
 * at evenly-spaced indices.
 */
export function selectByIndex(dayCapturesSorted: CdxEntry[], capturesPerDay: number): CdxEntry[] {
    const M = dayCapturesSorted.length;
    const N = Math.min(capturesPerDay, M);
    if (N <= 0) return [];
    if (N === 1) return [dayCapturesSorted[0]];

    const selected = new Map<number, CdxEntry>();
    for (let i = 0; i < N; i++) {
        const idx = Math.round(i * (M - 1) / (N - 1));
        if (!selected.has(idx)) {
            selected.set(idx, dayCapturesSorted[idx]);
        }
    }
    return [...selected.values()];
}

export function filterLimitedCapturesForUrl(snapshots: CdxEntry[], limitedCaptures: LimitedCaptureRange[]) {
    if (limitedCaptures.length === 0) {
        return snapshots;
    }

    const selectedTimestamps = new Set<string>();
    const processedTimestamps = new Set<string>();

    for (const capture of limitedCaptures) {
        const allInRange = snapshots
            .filter(snap => snap.timestamp >= capture.startTimestamp && snap.timestamp <= capture.endTimestamp);

        // Mark all timestamps in this range as processed (including non-200)
        for (const snap of allInRange) {
            processedTimestamps.add(snap.timestamp);
        }

        // Only keep 200s for selection
        const capturesForThisRange = allInRange
            .filter(snap => snap.status === '200')
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        // Group by UTC date (YYYYMMDD)
        const byDay = new Map<string, CdxEntry[]>();
        for (const snap of capturesForThisRange) {
            const dayKey = snap.timestamp.slice(0, 8);
            let arr = byDay.get(dayKey);
            if (!arr) {
                arr = [];
                byDay.set(dayKey, arr);
            }
            arr.push(snap);
        }

        for (const [, dayCaptures] of byDay) {
            let daySelected: CdxEntry[];
            if (dayCaptures.length <= capture.capturesPerDay) {
                // Not enough captures to need filtering — keep all
                daySelected = dayCaptures;
            } else if (dayCaptures.length > capture.capturesPerDay * THRESHOLD_MULTIPLIER) {
                // Many captures — use clock-time matching
                daySelected = selectByClockTime(dayCaptures, capture.capturesPerDay);
            } else {
                // Moderate number — use index-based spacing
                daySelected = selectByIndex(dayCaptures, capture.capturesPerDay);
            }
            for (const snap of daySelected) {
                selectedTimestamps.add(snap.timestamp);
            }
        }
    }

    // Build result: selected captures from limited ranges + all captures outside any range
    const result: CdxEntry[] = [];
    const seen = new Set<string>();
    for (const snap of snapshots) {
        if (seen.has(snap.timestamp)) continue;
        if (processedTimestamps.has(snap.timestamp)) {
            if (selectedTimestamps.has(snap.timestamp)) {
                result.push(snap);
                seen.add(snap.timestamp);
            }
        } else {
            result.push(snap);
            seen.add(snap.timestamp);
        }
    }

    result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return result;
}
