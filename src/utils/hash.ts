import { createHash } from "crypto";

export function computeSha256(data: Buffer): string {
  const hash = createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

// Wayback digest is base32-encoded SHA1 hash
// The CDX index actually has wrong digests for many captures, so we calculate
// it manually and store both in the resulting capture data
export function computeWaybackDigest(data: Buffer): string {
  const hash = createHash("sha1");
  hash.update(data);
  const digest = hash.digest();

  // Wayback uses base32 encoding (RFC 4648)
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < digest.length; i++) {
    value = (value << 8) | digest[i];
    bits += 8;

    while (bits >= 5) {
      result += base32Chars[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += base32Chars[(value << (5 - bits)) & 0x1f];
  }

  return result;
}
