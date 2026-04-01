export function isUrlSlashMatch(url1: string, url2: string): boolean {
  const urlObj1 = new URL(url1);
  const urlObj2 = new URL(url2);
  return urlObj1.pathname.toLowerCase() === urlObj2.pathname.toLowerCase();
}
