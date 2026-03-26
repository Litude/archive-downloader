export function urlIsIpv4Address(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const ipv4Regex =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(hostname);
  } catch (_e: unknown) {
    return false;
  }
}

export function getWaybackCaptureBaseUrl(
  url: string,
): { timestamp: string; originalUrl: string } | null {
  // http://web.archive.org/web/20110422114851id_/http://www.example.com/page -> http://www.example.com/page
  // http://web.archive.org/web/20110422114851/http://www.example.com/page -> http://www.example.com/page
  const [, timestamp, originalUrl] =
    url.match(/https?:\/\/web\.archive\.org\/web\/(\d+)(?:[a-z]{2}_)?\/(.*)/) ?? [];
  return originalUrl ? { timestamp, originalUrl } : null;
}
