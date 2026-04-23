import { urlToSimpleUrlkey } from "./urlkey.js";

export function urlCompare(url1: string, url2: string): number {
  const urlKey1 = urlToSimpleUrlkey(url1);
  const urlKey2 = urlToSimpleUrlkey(url2);
  if (urlKey1 > urlKey2) {
    return 1;
  } else if (urlKey1 < urlKey2) {
    return -1;
  } else {
    const uri1 = new URL(url1).toString().toLowerCase();
    const uri2 = new URL(url2).toString().toLowerCase();
    if (uri1 > uri2) {
      return 1;
    } else if (uri1 < uri2) {
      return -1;
    } else {
      return 0;
    }
  }
}
