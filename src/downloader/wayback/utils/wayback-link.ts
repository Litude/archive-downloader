import { isDefined } from "../../../utils/ts-utils.js";

export function parseWaybackLinkHeader(linkHeader: string) {
  const result = linkHeader
    .split(/,\s*(?=<)/)
    .map((part) => {
      const match = part.match(/^<([^>]*)>\s*(.*)/);
      if (!match) {
        return null;
      }

      const url = match[1];
      const attrs: {
        rel?: string;
        type?: string;
      } = {};

      const attrRegex = /;\s*([\w]+)="([^"]*)"/g;
      let m;
      while ((m = attrRegex.exec(match[2])) !== null) {
        if (m[1] === "rel" || m[1] === "type") {
          // Only extract rel and type attributes, ignore others
          attrs[m[1]] = m[2];
        }
      }
      return { url, ...attrs };
    })
    .filter(isDefined);
  return result;
}
