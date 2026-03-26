export function createIisEtagFromDate(date: string, changeNumber: number = 0): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{9})Z$/);
  if (!match) {
    throw new Error(`Invalid date format: ${date}`);
  }

  const [, y, mo, d, h, mi, s, ns] = match;
  const unixMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const nanoTicks = BigInt(ns) / 100n;
  const filetime = BigInt(unixMs) * 10000n + nanoTicks + 116444736000000000n;

  const bytes = new Uint8Array(8);
  let ft = filetime;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(ft & 0xffn);
    ft >>= 8n;
  }

  let hex = "";
  for (let i = 0; i < 8; i++) {
    const b = bytes[i];
    const high = b >> 4;
    if (high !== 0) {
      hex += high.toString(16);
    }
    hex += (b & 0xf).toString(16);
  }

  return `"${hex}:${changeNumber.toString(16)}"`;
}
