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
    const isLimited = limitedCaptureUrls.some((limitedUrl) => {
        limitedUrl.startsWith('/') ? new URL(url).pathname === limitedUrl : url === limitedUrl;
    });
    if (isLimited) {
        return {
            url,
            startTimestamp: "20000727000000",
            endTimestamp: "20001013235959",
            frequency: 1,
            unit: 'days'
        };
    } else {
        return null;
    }
}

export function checkForLimitedCaptureUrl(url: string) {
    const defaultLimitedCaptureUrls = loadDefaultLimitedCaptureUrls();
    return checkForLimitedCaptureUrlWithConfig(url, defaultLimitedCaptureUrls);
}


export function filterLimitedCapturesForUrl(snapshots: CdxEntry[], limitedCaptures: LimitedCaptureRange[]) {
    if (limitedCaptures.length === 0) {
        return snapshots;
    }
    
    const filteredSnapshots: CdxEntry[] = [];
    const processedTimestamps = new Set<string>();
    
    for (const capture of limitedCaptures) {
        const capturesForThisRange = snapshots.filter(snap =>
            snap.timestamp >= capture.startTimestamp && snap.timestamp <= capture.endTimestamp
        );
        // Now, we need to select captures based on frequency
        const frequencyInMinutes = (() => {
            switch (capture.unit) {
                case 'days': return capture.frequency * 24 * 60;
                case 'hours': return capture.frequency * 60;
                case 'minutes': return capture.frequency;
            }
        })();
        capturesForThisRange.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        let lastIncludedTimestamp: string | null = null;
        for (const snap of capturesForThisRange) {
            processedTimestamps.add(snap.timestamp);
            if (lastIncludedTimestamp === null) {
                filteredSnapshots.push(snap);
                lastIncludedTimestamp = snap.timestamp;
            } else {
                const lastDate = DateTime.fromFormat(lastIncludedTimestamp, 'yyyyMMddHHmmss', { zone: 'utc' });
                const currentDate = DateTime.fromFormat(snap.timestamp, 'yyyyMMddHHmmss', { zone: 'utc' });
                const minutesSinceLast = currentDate.diff(lastDate, 'minutes').minutes;
                
                if (minutesSinceLast >= frequencyInMinutes) {
                    filteredSnapshots.push(snap);
                    lastIncludedTimestamp = snap.timestamp;
                }
            }
        }
    }
    
    // Add all snapshots that are outside the limited capture ranges
    for (const snap of snapshots) {
        if (!processedTimestamps.has(snap.timestamp)) {
            filteredSnapshots.push(snap);
        }
    }
    
    // Sort by timestamp to maintain order
    filteredSnapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    
    return filteredSnapshots;
}
