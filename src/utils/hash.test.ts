import { describe, it, expect } from 'vitest';
import { computeWaybackDigest } from './hash';

describe('computeWaybackDigest', () => {

  it('should compute correct digest for white.gif', () => {
    // GIF89a 1x1 white pixel
    const hexData = `
    47 49 46 38 39 61 01 00 01 00 80 00 00 FF FF FF
    00 00 00 2C 00 00 00 00 01 00 01 00 00 02 02 44
    01 00 3B
    `.replace(/\s+/g, '');
    const data = Buffer.from(hexData, 'hex');
    const result = computeWaybackDigest(data);

    // digest of white.gif taken from wayback CDX entry
    expect(result).toBe('L66UOIRC724KELHVXCVF3RNY4E5PRDRL');
  });

  it('should compute correct digest for 1ptrans.gif', () => {
    // GIF89a 1x1 transparent pixel
    const hexData = `
    47 49 46 38 39 61 01 00 01 00 80 00 00 FF 33 CC
    00 00 00 21 F9 04 01 00 00 00 00 2C 00 00 00 00
    01 00 01 00 40 02 02 84 51 00 3B 00
    `.replace(/\s+/g, '');
    const data = Buffer.from(hexData, 'hex');
    const result = computeWaybackDigest(data);

    // digest of 1ptrans.gif taken from wayback CDX entry
    expect(result).toBe('EANFTOHNSBWIJSM6TPRSHU6F3UFAVUGU');
  });
});
