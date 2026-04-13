import zlib from "zlib";

export function extractGzipMembers(buffer: Buffer): Buffer[] {
  const members: Buffer[] = [];
  let remaining = buffer;

  while (remaining.length > 2) {
    // Find the first gzip magic byte pair \x1f\x8b
    let start = 0;
    while (
      start < remaining.length - 1 &&
      !(remaining[start] === 0x1f && remaining[start + 1] === 0x8b)
    ) {
      start++;
    }
    if (start >= remaining.length - 1) {
      break;
    }

    remaining = remaining.subarray(start);

    // Find the end of this member by trying each subsequent \x1f\x8b as a candidate boundary.
    // A gzip header is at minimum 10 bytes, so start searching after that.
    let memberEnd: number | null = null;
    let memberDecompressed: Buffer | null = null;
    for (let i = 10; i < remaining.length - 1; i++) {
      if (remaining[i] === 0x1f && remaining[i + 1] === 0x8b) {
        try {
          memberDecompressed = zlib.gunzipSync(remaining.subarray(0, i));
          memberEnd = i;
          break;
        } catch {
          // Not a real gzip boundary — false positive in compressed data, keep scanning
        }
      }
    }

    if (memberEnd !== null && memberDecompressed !== null) {
      members.push(memberDecompressed);
      remaining = remaining.subarray(memberEnd);
    } else {
      // No further boundary found — try the entire remaining buffer as the last member
      try {
        members.push(zlib.gunzipSync(remaining));
      } catch {
        // Partial or invalid member, nothing more to extract
      }
      break;
    }
  }

  return members;
}
