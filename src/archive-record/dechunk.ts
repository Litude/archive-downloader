export function dechunkChunkedResponse(body: Buffer): Buffer {
  let position = 0;
  const chunks: Buffer[] = [];

  while (position < body.length) {
    const crlfIndex = body.indexOf("\r\n", position);
    if (crlfIndex === -1) {
      throw new Error("Invalid chunked encoding: Missing CRLF after chunk size");
    }

    const chunkSizeHex = body.subarray(position, crlfIndex).toString().split(";")[0]; // Ignore any chunk extensions after ';'
    if (!/^[0-9a-fA-F]+$/.test(chunkSizeHex)) {
      throw new Error(`Invalid chunk size: ${chunkSizeHex}`);
    }
    const chunkSize = parseInt(chunkSizeHex, 16);
    if (isNaN(chunkSize)) {
      throw new Error(`Invalid chunk size: ${chunkSizeHex}`);
    }

    if (chunkSize === 0) {
      break; // End of chunks
    }

    const chunkStart = crlfIndex + 2;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > body.length) {
      // TODO: If we have truncated content, should we just return it as is?
      throw new Error("Invalid chunked encoding: Chunk size exceeds body length");
    }

    chunks.push(body.subarray(chunkStart, chunkEnd));
    if (body.subarray(chunkEnd, chunkEnd + 2).toString() !== "\r\n") {
      throw new Error("Invalid chunked encoding: Missing CRLF after chunk data");
    }
    position = chunkEnd + 2; // Move past the chunk and the following CRLF
  }

  return Buffer.concat(chunks);
}
