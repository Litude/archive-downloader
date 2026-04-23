import { describe, it, expect } from "vitest";
import { urlToWaybackUrlkey } from "./waybackurlkey.js";

describe("urlToWaybackUrlkey", () => {
  it("converts a simple URL", () => {
    expect(urlToWaybackUrlkey("http://example.com/")).toBe("com,example)/");
  });

  it("strips www prefix", () => {
    expect(urlToWaybackUrlkey("http://www.microsoft.com/games/empires/")).toBe(
      "com,microsoft)/games/empires",
    );
  });

  it("includes path and filename", () => {
    expect(urlToWaybackUrlkey("http://www.microsoft.com/games/empires/default.htm")).toBe(
      "com,microsoft)/games/empires/default.htm",
    );
  });

  it("lowercases and reorders query string", () => {
    expect(urlToWaybackUrlkey("http://www.microsoft.com/games/empires/?RLD=69")).toBe(
      "com,microsoft)/games/empires?rld=69",
    );
  });

  it("strips fragment", () => {
    expect(urlToWaybackUrlkey("http://example.com/page#section")).toBe("com,example)/page");
  });

  it("strips default http port 80", () => {
    expect(urlToWaybackUrlkey("http://example.com:80/path")).toBe("com,example)/path");
  });

  it("strips default https port 443", () => {
    expect(urlToWaybackUrlkey("https://example.com:443/path")).toBe("com,example)/path");
  });

  it("keeps non-standard port", () => {
    expect(urlToWaybackUrlkey("http://example.com:8080/path")).toBe("com,example:8080)/path");
  });

  it("lowercases host and path", () => {
    expect(urlToWaybackUrlkey("http://Example.COM/Foo/Bar")).toBe("com,example)/foo/bar");
  });

  it("handles https", () => {
    expect(urlToWaybackUrlkey("https://www.example.com/secure")).toBe("com,example)/secure");
  });

  it("strips empty query string", () => {
    expect(urlToWaybackUrlkey("http://microsoft.com:80/games/empires/?")).toBe(
      "com,microsoft)/games/empires",
    );
  });

  it("alpha-reorders and lowercases complex query string", () => {
    expect(
      urlToWaybackUrlkey(
        "http://www.microsoft.com:80/games/empires/downloads.htm?FinishURL=/downloads/release.asp?ReleaseID=10244&LangID=20&LangDIR=en-us&OpSysID=9800&Search=Product&Value=464&Show=Alpha&Top=+Age+of+Empires+Patch+1.0a+1.0a&Start=&Page=1&redirect=no",
      ),
    ).toBe(
      "com,microsoft)/games/empires/downloads.htm?finishurl=/downloads/release.asp?releaseid=10244&langdir=en-us&langid=20&opsysid=9800&page=1&redirect=no&search=product&show=alpha&start=&top=+age+of+empires+patch+1.0a+1.0a&value=464",
    );
  });

  it("strips multiple www prefixes", () => {
    expect(urlToWaybackUrlkey("http://www.www2.example.com/")).toBe("com,example)/");
  });

  it("handles dns: URLs", () => {
    expect(urlToWaybackUrlkey("dns:example.com")).toBe("com,example)");
  });

  it("passes through filedesc URLs", () => {
    expect(urlToWaybackUrlkey("filedesc:foo.arc.gz")).toBe("filedesc:foo.arc.gz");
  });

  it("handles weird backslashes in hostname like wayback", () => {
    expect(urlToWaybackUrlkey("http://\\www.example.com:80/secure/a.gif")).toBe(
      "com,example,\\www)/secure/a.gif",
    );
  });

  it("handles weird query parameters like wayback", () => {
    expect(
      urlToWaybackUrlkey(
        "http://www.microsoft.com:80/games/empires/downloads.htm?FinishURL=/downloads/release.asp?ReleaseID=10244&LangID=20&LangDIR=en-us&OpSysID=9800&Search=Product&Value=464&Show=Alpha&Top=+Age+of+Empires+Patch+1.0a+1.0a&Start=&Page=1&redirect=no",
      ),
    ).toBe(
      "com,microsoft)/games/empires/downloads.htm?finishurl=/downloads/release.asp?releaseid=10244&langdir=en-us&langid=20&opsysid=9800&page=1&redirect=no&search=product&show=alpha&start=&top=+age+of+empires+patch+1.0a+1.0a&value=464",
    );
  });
});
