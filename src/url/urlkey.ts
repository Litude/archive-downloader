/** This implements the urlkey normalization as observed in both Common Crawl and the Wayback Machine CDX APIs */
export function urlToSimpleUrlkey(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^www\d*\./, "");
  const reversedHost = hostname.split(".").reverse().join(",");
  const port = parsed.port ? `:${parsed.port}` : "";
  const query = parsed.search;
  const path =
    !query && parsed.pathname.endsWith("/") && parsed.pathname !== "/"
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
  return `${reversedHost}${port})${(path + query).toLowerCase()}`;
}
