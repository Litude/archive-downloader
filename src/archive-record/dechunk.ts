
export function dechunkChunkedResponse(body: Buffer): Buffer {
    let position = 0;
    const chunks: Buffer[] = [];

    while (position < body.length) {
        const crlfIndex = body.indexOf('\r\n', position);
        if (crlfIndex === -1) {
            throw new Error('Invalid chunked encoding: Missing CRLF after chunk size');
        }

        const chunkSizeHex = body.subarray(position, crlfIndex).toString().trim();
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
            throw new Error('Invalid chunked encoding: Chunk size exceeds body length');
        }

        chunks.push(body.subarray(chunkStart, chunkEnd));
        position = chunkEnd + 2; // Move past the chunk and the following CRLF
    }

    return Buffer.concat(chunks);
}
