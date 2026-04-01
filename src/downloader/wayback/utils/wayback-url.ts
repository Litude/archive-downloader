export function getWaybackCaptureBaseUrl(
  url: string,
): { timestamp: string; originalUrl: string } | null {
  // http://web.archive.org/web/20110422114851id_/http://www.example.com/page -> http://www.example.com/page
  // http://web.archive.org/web/20110422114851/http://www.example.com/page -> http://www.example.com/page
  const [, timestamp, originalUrl] =
    url.match(/https?:\/\/web\.archive\.org\/web\/(\d+)(?:[a-z]{2}_)?\/(.*)/) ?? [];
  return originalUrl ? { timestamp, originalUrl } : null;
}
