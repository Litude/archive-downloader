import { DateTime } from "luxon";
import { logWarning } from "./log-context";

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

function sanityCheckTimestamps({
    url, lastModified, mementoDate, serverDate, captureDate }: {
        url: string,
        lastModified: DateTime<true> | null,
        mementoDate: DateTime<true> | null,
        serverDate: DateTime<true> | null,
        captureDate: DateTime<true>
    }) {

    if (lastModified && lastModified.diff(captureDate).as('hours') > 1) {
        throw new Error(`Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: last-modified ${lastModified.toISO()} is more than 1 hour newer than capture date ${captureDate.toISO()}`);
    }
    if (mementoDate && Math.abs(mementoDate.diff(captureDate).as('hours')) > 1) {
        throw new Error(`Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: memento-datetime ${mementoDate.toISO()} is more than 1 hour different from capture date ${captureDate.toISO()}`);
    }
    else if (mementoDate && !mementoDate?.equals(captureDate)) {
        logWarning(`Memento datetime ${mementoDate.toISO({ suppressMilliseconds: true })} does not match capture date ${captureDate.toISO({ suppressMilliseconds: true })} for ${url}`, "timestamp-sanity-check");
        console.warn(`Warning: Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} memento-datetime ${mementoDate?.toISO()} is different from capture date ${captureDate.toISO()}`);
    }
    if (serverDate && Math.abs(serverDate.diff(captureDate).as('months')) > 1) {
        throw new Error(`Capture ${captureDate.toISO({ suppressMilliseconds: true })}-${url} Sanity check failed: server date ${serverDate.toISO()} is more than 1 month different from capture date ${captureDate.toISO()}`);
    }
}

export function parseHeaderTimestamps(
    url: string,
    headers: Record<string, any>,
    captureTimestamp: string,
    validateTimestamps: boolean,
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
    // Sometimes, it seems servers might return last-modified which is the same as date, so it is not a true
    // last-modified. If last-modified is exactly the same as server date, treat it as missing.
    if (lastModified && serverDate && lastModified.toMillis() === serverDate.toMillis()) {
        lastModified = null;
    }
    if (validateTimestamps) {
        sanityCheckTimestamps({ url, lastModified, mementoDate, serverDate, captureDate });
    }
    return { lastModified, mementoDate, serverDate, captureDate };
}
