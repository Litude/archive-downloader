import { DateTime } from "luxon";
import { logWarning } from "./log-context";

const FILETIME_EPOCH_OFFSET = 116444736000000000n;
const TICKS_PER_SECOND = 10000000n;
const TICKS_PER_MICROSECOND = 10n;

/**
 * Parses an IIS 5.0 ETag to extract the file modification timestamp
 * with full nanosecond precision.
 *
 * IIS 5.0 FormatETag encodes a Windows FILETIME byte-by-byte in hex
 * (little-endian memory order), stripping each byte's leading zero nibble.
 * Format: "encodedFiletime:metabaseChangeNumber"
 *
 * Returns an ISO-like UTC string "YYYY-MM-DDTHH:mm:ss.nnnnnnnnnZ" with
 * nanosecond precision, or null if the ETag doesn't match IIS format
 * or no valid date is found.
 * 
 * Since FILETIMEs have a precision of 100 nanoseconds, the last 2 digits of
 * the nanosecond portion will always be zero.
 */
export function parseIisEtagDate(
  etag: string,
  captureDate: DateTime<true>
): string[] | null {
  const match = etag.match(/^"?([0-9a-fA-F]+):[0-9a-fA-F]+"?$/);
  if (!match) return null;

  const timestampHex = match[1].toLowerCase();

  if (timestampHex.length < 8 || timestampHex.length > 16) return null;

  const candidates: string[] = [];
  splitBytes(timestampHex, 0, 0, new Uint8Array(8), (bytes) => {
    const result = filetimeToTimestamp(bytes);
    if (result && isPlausibleDate(result.unixSeconds, captureDate)) {
      candidates.push(result.formatted);
    }
  });

  if (candidates.length === 0) return null;
  else {
    return candidates;
  }
}

export function getMostLikelyEtagDate(
    etag: string,
    captureDate: DateTime<true>,
    modifyDate: DateTime<true>
): string[] | null {
  const candidates = parseIisEtagDate(etag, captureDate);
  if (!candidates) throw new Error("No valid ETag candidates found");

  const modifyDateSec = modifyDate.toISO({ suppressMilliseconds: true }).slice(0, -1); // Remove trailing 'Z' for easier comparison
  // Since IIS truncates any sub-second precision units when creating the modify date header, the original second must match
  const validCandidates = candidates.filter(c => c.startsWith(modifyDateSec));
  if (validCandidates.length === 0) {
    console.log(`No ETag candidates match modify date ${modifyDate.toISO()}`);
    return null;
  }
  else if (validCandidates.length === 1) {
    return validCandidates;
  }
  else {
    // Since we already checked that the seconds match, we can just sort lexicographically to find the closest candidate (i.e. the one with the smallest difference in sub-second units)
    validCandidates.sort();
    // logWarning(`Multiple ETag candidates match modify date ${modifyDate.toISO({ suppressMilliseconds: true })} (candidates: ${validCandidates.join(", ")}).`, "iis-etag-parser");
    // console.warn(`Multiple ETag candidates match modify date ${modifyDate.toISO({ suppressMilliseconds: true })}, candidates:\n${validCandidates.join(", ")}\nChoosing closest candidate.`);
    return validCandidates;
  }
}

/**
 * Recursively tries all valid ways to split the hex string into 8 bytes.
 * Each byte was encoded as either 1 char (value 0x00–0x0F, leading nibble stripped)
 * or 2 chars (value 0x10–0xFF, leading nibble non-zero).
 */
function splitBytes(
  hex: string,
  charIndex: number,
  byteIndex: number,
  bytes: Uint8Array,
  onResult: (bytes: Uint8Array) => void
): void {
  if (byteIndex === 8) {
    if (charIndex === hex.length) {
      onResult(bytes);
    }
    return;
  }

  const remainingChars = hex.length - charIndex;
  const remainingBytes = 8 - byteIndex;

  if (remainingChars < remainingBytes || remainingChars > 2 * remainingBytes) {
    return;
  }

  // 1-char: byte value 0x00–0x0F (leading nibble was zero, stripped)
  bytes[byteIndex] = parseInt(hex[charIndex], 16);
  splitBytes(hex, charIndex + 1, byteIndex + 1, bytes, onResult);

  // 2-char: byte value 0x10–0xFF (leading nibble non-zero, kept)
  if (charIndex + 1 < hex.length && hex[charIndex] !== '0') {
    bytes[byteIndex] = parseInt(hex.substring(charIndex, charIndex + 2), 16);
    splitBytes(hex, charIndex + 2, byteIndex + 1, bytes, onResult);
  }
}

/** Converts 8 little-endian FILETIME bytes to a formatted UTC timestamp string. */
function filetimeToTimestamp(
  bytes: Uint8Array
): { formatted: string; unixSeconds: number } | null {
  let filetime = 0n;
  for (let i = 7; i >= 0; i--) {
    filetime = (filetime << 8n) | BigInt(bytes[i]);
  }

  if (filetime < FILETIME_EPOCH_OFFSET) return null;

  const unixTicks = filetime - FILETIME_EPOCH_OFFSET;
  const totalSeconds = unixTicks / TICKS_PER_SECOND;
  const remainderTicks = unixTicks % TICKS_PER_SECOND;
  const nanoseconds = remainderTicks * 100n;
  const microseconds = remainderTicks / TICKS_PER_MICROSECOND;

  const unixMs = Number(totalSeconds) * 1000;
  const date = new Date(unixMs);

  if (isNaN(date.getTime())) return null;

  const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');
  const hh = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  const us = nanoseconds.toString().padStart(9, '0');

  return {
    formatted: `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.${us}Z`,
    unixSeconds: Number(totalSeconds) + Number(microseconds) / 1_000_000,
  };
}

/** File modification must be before the capture (with tolerance), and not impossibly old. */
function isPlausibleDate(
  unixSeconds: number,
  captureDate: DateTime<true>
): boolean {
  const captureSec = captureDate.toMillis() / 1000;
  const initialTime = DateTime.fromISO("1996-01-01T00:00:00Z").toMillis() / 1000;
  const oneDay = 86400;
  return unixSeconds >= initialTime
      && unixSeconds <= captureSec + oneDay;
}

function isoToUnixSeconds(iso: string): number {
  const [datePart, timePart] = iso.replace('Z', '').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, rest] = timePart.split(':');
  const [ss, us] = rest.split('.');
  const date = Date.UTC(y, m - 1, d, Number(hh), Number(mm), Number(ss));
  return date / 1000 + Number(us) / 1_000_000;
}
