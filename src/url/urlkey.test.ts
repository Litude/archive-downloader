import { describe, it, expect } from "vitest";
import { urlKeyToUrl, urlToSimpleUrlkey as urlToUrlkey } from "./urlkey.js";

describe("urlToUrlkey", () => {
  it("converts a simple URL", () => {
    expect(urlToUrlkey("http://example.com/")).toBe("com,example)/");
  });

  it("reverses multi-part hostname", () => {
    expect(urlToUrlkey("http://www.microsoft.com/games/empires/")).toBe(
      "com,microsoft)/games/empires",
    );
  });

  it("includes path and filename", () => {
    expect(urlToUrlkey("http://www.microsoft.com/games/empires/default.htm")).toBe(
      "com,microsoft)/games/empires/default.htm",
    );
  });

  it("includes query string", () => {
    expect(urlToUrlkey("http://www.microsoft.com/games/empires/?RLD=69")).toBe(
      "com,microsoft)/games/empires/?rld=69",
    );
  });

  it("strips fragment", () => {
    expect(urlToUrlkey("http://example.com/page#section")).toBe("com,example)/page");
  });

  it("strips standard http port 80", () => {
    expect(urlToUrlkey("http://example.com:80/path")).toBe("com,example)/path");
  });

  it("strips standard https port 443", () => {
    expect(urlToUrlkey("https://example.com:443/path")).toBe("com,example)/path");
  });

  it("keeps non-standard port", () => {
    expect(urlToUrlkey("http://example.com:8080/path")).toBe("com,example:8080)/path");
  });

  it("lowercases path", () => {
    expect(urlToUrlkey("http://Example.COM/Foo/Bar")).toBe("com,example)/foo/bar");
  });

  it("handles https", () => {
    expect(urlToUrlkey("https://www.example.com/secure")).toBe("com,example)/secure");
  });

  it("handles empty query string", () => {
    expect(urlToUrlkey("http://microsoft.com:80/games/empires/?")).toBe(
      "com,microsoft)/games/empires",
    );
  });
});

describe("urlKeyToUrl", () => {
  it("converts a simple urlkey", () => {
    expect(urlKeyToUrl("com,example)/")).toBe("http://example.com/");
  });

  it("reconstructs multi-part hostname", () => {
    expect(urlKeyToUrl("com,microsoft)/games/empires")).toBe("http://microsoft.com/games/empires");
  });

  it("includes path and filename", () => {
    expect(urlKeyToUrl("com,microsoft)/games/empires/default.htm")).toBe(
      "http://microsoft.com/games/empires/default.htm",
    );
  });

  it("includes query string", () => {
    expect(urlKeyToUrl("com,microsoft)/games/empires/?rld=69")).toBe(
      "http://microsoft.com/games/empires/?rld=69",
    );
  });

  it("handles non-standard port", () => {
    expect(urlKeyToUrl("com,example:8080)/path")).toBe("http://example.com:8080/path");
  });
});
