/** This implements the urlkey normalization as observed in both Common Crawl and the Wayback Machine CDX APIs */
export function urlToUrlkey(url: string): string {
  const isCorruptUrl = url.startsWith("http://\\") || url.startsWith("https://\\");
  const parsed = new URL(url);
  let hostname = parsed.hostname;
  hostname = isCorruptUrl ? hostname : hostname.replace(/^www\d*\./, "");
  const reversedHostParts = hostname.split(".").reverse();
  if (isCorruptUrl) {
    reversedHostParts[reversedHostParts.length - 1] =
      `\\${reversedHostParts[reversedHostParts.length - 1]}`;
  }
  const reversedHost = reversedHostParts.join(",");
  const port = parsed.port ? `:${parsed.port}` : "";
  const query = parsed.search;
  const path =
    !query && parsed.pathname.endsWith("/") && parsed.pathname !== "/"
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
  return `${reversedHost}${port})${(path + query).toLowerCase()}`;
}
