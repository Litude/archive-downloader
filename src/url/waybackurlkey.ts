import { domainToASCII } from "url";

// Port of the Internet Archive's URL canonicalization pipeline:
//   URLParser → AggressiveIAURLCanonicalizer → WaybackURLKeyMaker (SURT key)
// Sources:
//   https://github.com/internetarchive/archive-commons/tree/master/archive-commons/src/main/java/org/archive/url/

// ── HandyURL ─────────────────────────────────────────────────────────────────

const DEFAULT_PORT = -1;

interface HandyURL {
  scheme: string | null;
  authUser: string | null;
  authPass: string | null;
  host: string | null;
  port: number;
  path: string | null;
  query: string | null; // includes leading '?'
  hash: string | null; // includes leading '#'
  opaque: string | null;
}

function makeHandyURL(
  scheme: string | null = null,
  authUser: string | null = null,
  authPass: string | null = null,
  host: string | null = null,
  port: number = DEFAULT_PORT,
  path: string | null = null,
  query: string | null = null,
  hash: string | null = null,
): HandyURL {
  return { scheme, authUser, authPass, host, port, path, query, hash, opaque: null };
}

function getURLString(url: HandyURL, surt: boolean, includeScheme: boolean): string {
  if (url.opaque !== null) {
    return url.opaque;
  }

  let sb = "";

  if (includeScheme) {
    sb += `${url.scheme}://`;
    if (surt) {
      sb += "(";
    }
  }

  if (url.authUser !== null) {
    sb += url.authUser;
    if (url.authPass !== null) {
      sb += `:${url.authPass}`;
    }
    sb += "@";
  }

  const hostSrc = surt ? hostToSURT(url.host ?? "") : (url.host ?? "");
  sb += hostSrc;

  if (url.port !== DEFAULT_PORT) {
    sb += `:${url.port}`;
  }

  if (surt) {
    sb += ")";
  }

  if (url.path !== null && url.path.length > 0) {
    sb += url.path;
  } else if (url.query !== null || url.hash !== null) {
    sb += "/";
  }

  if (url.query !== null) {
    sb += url.query;
  }
  if (url.hash !== null) {
    sb += url.hash;
  }

  return sb;
}

// ── URL Parser ────────────────────────────────────────────────────────────────

const STRAY_SPACING = /[\n\r\t\u0085\u2028\u2029]+/g;
const HTTP_SCHEME_SLASHES = /^(https?:\/\/)\/+(.*)/i;
const ALL_SCHEMES = /^(?:https?|ftp|mms|rtsp|wais):\/\//i;
const URI_REGEX =
  /^(?:([a-zA-Z][a-zA-Z0-9+\-.]*)(?::))?(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/;

function parseURL(urlString: string): HandyURL {
  urlString = urlString.trim().replace(STRAY_SPACING, "");

  if (
    urlString.startsWith("dns:") ||
    urlString.startsWith("filedesc:") ||
    urlString.startsWith("warcinfo:")
  ) {
    const h = makeHandyURL();
    h.opaque = urlString;
    return h;
  }

  if (!ALL_SCHEMES.test(urlString)) {
    urlString = "http://" + urlString;
  }

  const schemeSlashMatch = HTTP_SCHEME_SLASHES.exec(urlString);
  if (schemeSlashMatch) {
    urlString = schemeSlashMatch[1] + schemeSlashMatch[2];
  }

  const m = URI_REGEX.exec(urlString);
  if (!m) {
    throw new Error(`No URI match: ${urlString}`);
  }

  const uriScheme = m[1] ?? null;
  const uriAuthority = m[2] ?? "";
  const uriPath = m[3] ?? null;
  const uriQuery = m[4] ?? null;
  const uriFragment = m[5] ?? null;

  let authUser: string | null = null;
  let authPass: string | null = null;

  let hostname!: string;
  let port = DEFAULT_PORT;

  const atIdx = uriAuthority.indexOf("@");
  const portColonIdx = uriAuthority.indexOf(":", atIdx < 0 ? 0 : atIdx);

  if (atIdx < 0 && portColonIdx < 0) {
    hostname = uriAuthority;
  } else if (atIdx < 0) {
    hostname = uriAuthority.substring(0, portColonIdx);
    port = parseInt(uriAuthority.substring(portColonIdx + 1), 10);
  } else if (portColonIdx < 0) {
    const userInfo = uriAuthority.substring(0, atIdx);
    hostname = uriAuthority.substring(atIdx + 1);
    const passColon = userInfo.indexOf(":");
    authUser = passColon < 0 ? userInfo : userInfo.substring(0, passColon);
    authPass = passColon < 0 ? null : userInfo.substring(passColon + 1);
  } else {
    const userInfo = uriAuthority.substring(0, atIdx);
    hostname = uriAuthority.substring(atIdx + 1, portColonIdx);
    port = parseInt(uriAuthority.substring(portColonIdx + 1), 10);
    const passColon = userInfo.indexOf(":");
    authUser = passColon < 0 ? userInfo : userInfo.substring(0, passColon);
    authPass = passColon < 0 ? null : userInfo.substring(passColon + 1);
  }

  if (isNaN(port)) {
    port = DEFAULT_PORT;
  }

  return makeHandyURL(
    uriScheme,
    authUser,
    authPass,
    hostname,
    port,
    uriPath,
    uriQuery,
    uriFragment,
  );
}

// ── URL Regex Transformer ─────────────────────────────────────────────────────

function hostToSURT(host: string): string {
  const parts = host.split(".");
  if (parts.length === 1) {
    return host;
  }
  return [...parts].reverse().join(",");
}

interface OptPattern {
  re: RegExp;
  match: string;
  start: number;
  end: number;
}

const PATH_OPTS: OptPattern[] = [
  {
    re: /^(.*\/)(\((?:[a-z]\([0-9a-z]{24}\))+\)\/)([^?]+\.aspx.*)$/i,
    match: ".aspx",
    start: 1,
    end: 3,
  },
  {
    re: /^(.*\/)(\([0-9a-z]{24}\)\/)([^?]+\.aspx.*)$/i,
    match: ".aspx",
    start: 1,
    end: 3,
  },
];

const QUERY_OPTS: OptPattern[] = [
  {
    re: /^(.+?)(jsessionid=[0-9a-zA-Z]{32})(?:&(.*))?$/i,
    match: "jsessionid=",
    start: 1,
    end: 3,
  },
  {
    re: /^(.+?)(phpsessid=[0-9a-zA-Z]{32})(?:&(.*))?$/i,
    match: "phpsessid=",
    start: 1,
    end: 3,
  },
  {
    re: /^(.+?)(sid=[0-9a-zA-Z]{32})(?:&(.*))?$/i,
    match: "sid=",
    start: 1,
    end: 3,
  },
  {
    re: /^(.+?)(ASPSESSIONID[a-zA-Z]{8}=[a-zA-Z]{24})(?:&(.*))?$/i,
    match: "aspsessionid",
    start: 1,
    end: 3,
  },
  {
    re: /^(.+?)(cfid=[^&]+&cftoken=[^&]+)(?:&(.*))?$/i,
    match: "cftoken=",
    start: 1,
    end: 3,
  },
];

// stripOpts strips session-related tokens from URLs.
// The Java implementation uses start/end group indices to splice them out;
// here we use start=prefix group, end=suffix group, splicing out what's between.
function stripOpts(orig: string, opts: OptPattern[]): string {
  const lc = orig.toLowerCase();
  let result = orig;

  for (const opt of opts) {
    if (!lc.includes(opt.match)) {
      continue;
    }
    const m = opt.re.exec(result);
    if (!m) {
      continue;
    }

    if (opt.start === opt.end) {
      // Delete the group entirely
      const deleted = m[opt.start] ?? "";
      result = result.substring(0, m.index) + result.substring(m.index + m[0].length);
      result = result.replace(deleted, "");
    } else {
      // Keep prefix (start group) and suffix (end group), discard middle
      const prefix = m[opt.start] ?? "";
      const suffix = m[opt.end] ?? null;
      result = suffix !== null ? prefix + suffix : prefix;
    }
  }

  return result;
}

function stripPathSessionID(path: string): string {
  return stripOpts(path, PATH_OPTS);
}

function stripQuerySessionID(query: string): string {
  return stripOpts(query, QUERY_OPTS);
}

// ── Basic Canonicalizer (Google Safe Browsing rules) ─────────────────────────

function isHexChar(c: string): boolean {
  return (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
}

function decode(input: string): string {
  if (!input.includes("%")) {
    return input;
  }
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (
      input[i] === "%" &&
      i + 2 < input.length &&
      isHexChar(input[i + 1]) &&
      isHexChar(input[i + 2])
    ) {
      // Collect a run of consecutive %XX sequences to handle multi-byte UTF-8
      let pctRun = "";
      let j = i;
      while (
        j < input.length &&
        input[j] === "%" &&
        j + 2 < input.length &&
        isHexChar(input[j + 1]) &&
        isHexChar(input[j + 2])
      ) {
        pctRun += input.substring(j, j + 3);
        j += 3;
      }
      try {
        result += decodeURIComponent(pctRun);
        i = j;
      } catch {
        // Decode only the first byte if it's plain ASCII
        const b = parseInt(input.substring(i + 1, i + 3), 16);
        result += b < 0x80 ? String.fromCharCode(b) : input.substring(i, i + 3);
        i += 3;
      }
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

function unescapeRepeatedly(input: string | null): string | null {
  if (input === null) {
    return null;
  }
  while (true) {
    const decoded = decode(input);
    if (decoded === input) {
      return input;
    }
    input = decoded;
  }
}

function escapeOnce(input: string | null): string | null {
  if (input === null) {
    return null;
  }
  const bytes = Buffer.from(input, "utf8");
  let result = "";
  let changed = false;
  for (const b of bytes) {
    if (b > 32 && b < 128 && b !== 0x23 /* # */ && b !== 0x25 /* % */) {
      result += String.fromCharCode(b);
    } else {
      changed = true;
      result += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return changed ? result : input;
}

function minimalEscape(input: string | null): string | null {
  return escapeOnce(unescapeRepeatedly(input));
}

function normalizePath(path: string | null): string {
  if (path === null) {
    return "/";
  }
  const segments = path.split("/");
  const kept: string[] = [];
  let first = true;
  for (const seg of segments) {
    if (first) {
      first = false;
      continue;
    }
    if (seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (kept.length > 0) {
        kept.pop();
      } else {
        kept.push(seg);
      }
    } else {
      kept.push(seg);
    }
  }
  if (kept.length === 0) {
    return "/";
  }
  let out = "/";
  for (let i = 0; i < kept.length - 1; i++) {
    if (kept[i].length > 0) {
      out += kept[i] + "/";
    }
  }
  out += kept[kept.length - 1];
  return out;
}

function attemptIPFormats(host: string | null): string | null {
  if (host === null) {
    return null;
  }

  // Single decimal integer → 32-bit dotted IP
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) {
      const u = n >>> 0;
      return `${(u >>> 24) & 0xff}.${(u >>> 16) & 0xff}.${(u >>> 8) & 0xff}.${u & 0xff}`;
    }
    return null;
  }

  // Octal dotted quad (all four parts must be present)
  const octalMatch = /^(0[0-7]*)\.([0-7]+)\.([0-7]+)\.([0-7]+)$/.exec(host);
  if (octalMatch) {
    try {
      const ip = [
        parseInt(octalMatch[1], 8),
        parseInt(octalMatch[2], 8),
        parseInt(octalMatch[3], 8),
        parseInt(octalMatch[4], 8),
      ];
      if (ip.every((o) => o >= 0 && o <= 255)) {
        return ip.join(".");
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  // Decimal dotted quad (all four parts must be present; leading digit 1-9 to avoid octal overlap)
  const decimalMatch = /^([1-9][0-9]*)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(host);
  if (decimalMatch) {
    try {
      const ip = [
        parseInt(decimalMatch[1], 10),
        parseInt(decimalMatch[2], 10),
        parseInt(decimalMatch[3], 10),
        parseInt(decimalMatch[4], 10),
      ];
      if (ip.every((o) => o >= 0 && o <= 255)) {
        return ip.join(".");
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  return null;
}

function basicCanonicalize(url: HandyURL): void {
  url.hash = null;
  url.authUser = minimalEscape(url.authUser);
  url.authPass = minimalEscape(url.authPass);
  url.query = minimalEscape(url.query);

  const hostUnescaped = unescapeRepeatedly(url.host) ?? "";
  let host: string;
  const asciiHost = domainToASCII(hostUnescaped);
  host = asciiHost !== "" ? asciiHost : hostUnescaped;
  host = host.replace(/^\.+/, "").replace(/\.\./g, ".").replace(/\.$/, "");

  const ipHost = attemptIPFormats(host);
  if (ipHost !== null) {
    url.host = ipHost;
  } else {
    url.host = escapeOnce(host.toLowerCase());
  }

  const pathUnescaped = unescapeRepeatedly(url.path);
  url.path = escapeOnce(normalizePath(pathUnescaped));
}

// ── IA Canonicalizer (Aggressive rules) ──────────────────────────────────────

const WWWN_PATTERN = /^www\d*\./;

function massageHost(host: string): string {
  while (WWWN_PATTERN.test(host)) {
    host = host.replace(WWWN_PATTERN, "");
  }
  return host;
}

function getDefaultPort(scheme: string | null): number {
  const lc = (scheme ?? "").toLowerCase();
  if (lc === "http") {
    return 80;
  }
  if (lc === "https") {
    return 443;
  }
  return 0;
}

function splitQueryParam(param: string): [string, string | null] {
  const idx = param.indexOf("=");
  if (idx < 0) {
    return [param, null];
  }
  return [param.substring(0, idx), param.substring(idx + 1)];
}

function alphaReorderQuery(orig: string | null): string | null {
  if (orig === null) {
    return null;
  }
  if (orig.length <= 1) {
    return orig;
  }

  const withoutQ = orig.substring(1); // strip leading '?'
  const pairs = withoutQ.split("&").map(splitQueryParam);

  pairs.sort(([k1, v1], [k2, v2]) => {
    if (k1 < k2) {
      return -1;
    }
    if (k1 > k2) {
      return 1;
    }
    if (v1 === null && v2 === null) {
      return 0;
    }
    if (v1 === null) {
      return -1;
    }
    if (v2 === null) {
      return 1;
    }
    if (v1 < v2) {
      return -1;
    }
    if (v1 > v2) {
      return 1;
    }
    return 0;
  });

  let result = "?";
  for (let i = 0; i < pairs.length - 1; i++) {
    const [k, v] = pairs[i];
    result += v === null ? `${k}&` : `${k}=${v}&`;
  }
  const [k, v] = pairs[pairs.length - 1];
  result += v === null ? k : `${k}=${v}`;

  return result;
}

function iaCanonicalize(url: HandyURL): void {
  if (url.opaque !== null) {
    return;
  }

  // scheme lowercase
  if (url.scheme !== null) {
    url.scheme = url.scheme.toLowerCase();
  }

  // host lowercase + www-stripping
  url.host = massageHost((url.host ?? "").toLowerCase());

  // strip auth
  url.authUser = null;
  url.authPass = null;

  // strip default port
  if (url.port === getDefaultPort(url.scheme)) {
    url.port = DEFAULT_PORT;
  }

  // path
  let path = url.path ?? "/";
  path = path.toLowerCase();
  path = stripPathSessionID(path);
  if (path.endsWith("/") && path.length > 1) {
    path = path.substring(0, path.length - 1);
  }
  url.path = path;

  // query
  let query = url.query;
  if (query !== null) {
    if (query === "?") {
      query = null;
    } else if (query.length > 0) {
      query = stripQuerySessionID(query);
      query = query.toLowerCase();
      query = alphaReorderQuery(query);
    }
    url.query = query;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function urlToWaybackUrlkey(urlString: string): string {
  if (!urlString) {
    return "-";
  }

  if (urlString.startsWith("filedesc") || urlString.startsWith("warcinfo")) {
    return urlString;
  }

  if (urlString.startsWith("dns:")) {
    const authority = urlString.substring(4);
    return hostToSURT(authority) + ")";
  }

  let url: HandyURL;
  try {
    url = parseURL(urlString);
  } catch {
    return urlString;
  }

  basicCanonicalize(url);
  iaCanonicalize(url);

  const key = getURLString(url, true, true);

  const parenIdx = key.indexOf("(");
  if (parenIdx < 0) {
    return urlString;
  }

  return key.substring(parenIdx + 1);
}

export { massageHost, alphaReorderQuery, hostToSURT };
