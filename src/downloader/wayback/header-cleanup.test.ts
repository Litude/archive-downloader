import { describe, it, expect } from "vitest";
import { cleanupWaybackHeaders } from "./header-cleanup.js";
import { RawHeader, UNCONFIRMED_HEADER_MARKER } from "../../headers/raw-header-parser.js";
import { DateTime } from "luxon";

describe("cleanupHeaders", () => {
  it("should keep only recognized headers and strip wayback prefix from location", () => {
    const headers: Record<string, string> = {
      "content-type": "text/html",
      location: "https://web.archive.org/web/20010101120000/http://example.com/page",
      "x-custom-header": "should-be-removed",
      "memento-datetime": "Thu, 01 Jan 2001 12:00:00 GMT",
    };
    const rawHeaders: RawHeader[] = [
      ["content-type", "text/html"],
      ["location", "https://web.archive.org/web/20010101120000/http://example.com/page"],
      ["x-custom-header", "should-be-removed"],
      ["memento-datetime", "Thu, 01 Jan 2001 12:00:00 GMT"],
    ];
    const url = "http://example.com/page";

    const result = cleanupWaybackHeaders(
      url,
      headers,
      rawHeaders,
      {
        base: "defalt",
        ext: ".html",
      },
      DateTime.fromISO("2020-11-15T10:00:00Z"),
    );

    expect(result).toEqual([
      ["content-type", "text/html", UNCONFIRMED_HEADER_MARKER],
      ["location", "http://example.com/page", UNCONFIRMED_HEADER_MARKER],
    ]);
  });

  it("should preserve x-archive-orig- prefixed headers", () => {
    const headers: Record<string, string> = {
      "content-encoding": "gzip",
      "x-archive-orig-content-type": "image/gif",
      "x-archive-orig-last-modified": "Wed, 15 Nov 2000 10:00:00 GMT",
      "x-unrelated": "dropped",
    };
    const rawHeaders: RawHeader[] = [
      ["content-encoding", "gzip"],
      ["x-archive-orig-content-type", "image/gif"],
      ["x-archive-orig-last-modified", "Wed, 15 Nov 2000 10:00:00 GMT"],
      ["x-unrelated", "dropped"],
    ];
    const url = "http://example.com/page";

    const result = cleanupWaybackHeaders(
      url,
      headers,
      rawHeaders,
      {
        base: "defalt",
        ext: ".html",
      },
      DateTime.fromISO("2020-11-15T10:00:00Z"),
    );

    expect(result).toEqual([
      ["content-encoding", "gzip"],
      ["content-type", "image/gif"],
      ["last-modified", "Wed, 15 Nov 2000 10:00:00 GMT"],
    ]);
  });

  it("should remove web archive prefixes and origin from relative redirect headers", () => {
    const headers: Record<string, string> = {
      "content-type": "text/html",
      location:
        "/web/20080224035142id_/http://www.microsoft.com/japan/library/404/error.aspx?url=/japan/games/empires/default.asp",
    };
    const rawHeaders: RawHeader[] = [
      ["content-type", "text/html"],
      [
        "location",
        "/web/20080224035142id_/http://www.microsoft.com/japan/library/404/error.aspx?url=/japan/games/empires/default.asp",
      ],
    ];
    const url = "http://www.microsoft.com:80/japan/games/empires/default.asp";

    const result = cleanupWaybackHeaders(
      url,
      headers,
      rawHeaders,
      { base: "defalt", ext: ".asp" },
      DateTime.fromISO("2020-11-15T10:00:00Z"),
    );

    expect(result).toEqual([
      ["content-type", "text/html", UNCONFIRMED_HEADER_MARKER],
      [
        "location",
        "/japan/library/404/error.aspx?url=/japan/games/empires/default.asp",
        UNCONFIRMED_HEADER_MARKER,
      ],
    ]);
  });

  it("should remove web archive prefixes from absolute redirect headers", () => {
    const headers: Record<string, string> = {
      "content-type": "text/html",
      location:
        "https://web.archive.org/web/20030814092453id_/http://www.microsoft.com:80/japan/games/empires/download/up10a.asp",
    };
    const rawHeaders: RawHeader[] = [
      ["content-type", "text/html"],
      [
        "location",
        "https://web.archive.org/web/20030814092453id_/http://www.microsoft.com:80/japan/games/empires/download/up10a.asp",
      ],
    ];
    const url = "http://www.microsoft.com:80/japan/games/empires/download/up10a.htm";

    const result = cleanupWaybackHeaders(
      url,
      headers,
      rawHeaders,
      { base: "defalt", ext: ".asp" },
      DateTime.fromISO("2020-11-15T10:00:00Z"),
    );

    expect(result).toEqual([
      ["content-type", "text/html", UNCONFIRMED_HEADER_MARKER],
      [
        "location",
        "http://www.microsoft.com:80/japan/games/empires/download/up10a.asp",
        UNCONFIRMED_HEADER_MARKER,
      ],
    ]);
  });
});
