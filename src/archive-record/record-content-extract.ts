import zlib from "zlib";
import { RawHeader } from "../headers/raw-header-parser.js";
import { dechunkChunkedResponse } from "./dechunk.js";

export function extractRecordContent(content: Buffer, headers: RawHeader[], { alreadyDechunked = false }: { alreadyDechunked?: boolean; } = {}): Buffer {
  let finalBuffer = content;
  const isChunked = headers.some(
    ([name, value]) =>
      name.toLowerCase() === "transfer-encoding" && value.toLowerCase() === "chunked",
  );
  if (isChunked && !alreadyDechunked) {
    finalBuffer = dechunkChunkedResponse(finalBuffer);
  }

  const isPossiblyGzipped = headers.some(
    ([name, value]) =>
      name.toLowerCase() === "content-encoding" && value.toLowerCase() === "gzip",
  );
  if (isPossiblyGzipped) {
    // Sometimes the entry might already be stored decompressed even if the header indicates it would be gzipped,
    // so we check the magic number before trying to decompress and if decompressing fails we just return the original content
    const gzipMagicNumber = Buffer.from([0x1f, 0x8b]);
    if (finalBuffer.subarray(0, 2).equals(gzipMagicNumber)) {
      try {
        finalBuffer = zlib.gunzipSync(finalBuffer);
      } catch (_e) {
        // If decompression fails, we just return the original content
      }
    }
  }
  return finalBuffer;
}
