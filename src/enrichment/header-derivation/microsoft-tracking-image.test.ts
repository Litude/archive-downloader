import { describe, it, expect } from "vitest";
import { deriveRefererFromMicrosoftTrackingImage } from "./microsoft-tracking-image.js";
import { CaptureEntry } from "../../types/capture-types.js";

function makeEntry(
  html: string,
  mimetype = "text/html",
): Pick<CaptureEntry, "content" | "mimetype" | "timestamp" | "url"> {
  return {
    content: Buffer.from(html, "latin1"),
    mimetype,
    timestamp: "19991001120000",
    url: "http://www.microsoft.com/",
  };
}

const TRACKING_BASE =
  "http://c.microsoft.com/trans_pixel.asp?TrackID=1&URI=%2Fdefault.asp&r=http%3A%2F%2Fwww.microsoft.com%2Fdefault.asp&source=www&type=page";

function primaryHtml(trackingUrl: string) {
  return `<layer visibility="hide"><div style="display:none"><img src="${trackingUrl}"></div></layer>`;
}
function secondaryHtml(trackingUrl: string) {
  return `<layer visibility="hide"><div style="display:none"><img alt="" width="0" height="0" border="0" hspace="0" vspace="0" src="${trackingUrl}"></div></layer>`;
}

describe("deriveReferrerFromMicrosoftTrackingImage", () => {
  it("returns undefined when content is missing", () => {
    const entry = makeEntry("");
    entry.content = undefined;
    expect(deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry)).toBeUndefined();
  });

  it("returns undefined when mimetype is not text/html", () => {
    const entry = makeEntry(primaryHtml(TRACKING_BASE), "image/gif");
    expect(deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry)).toBeUndefined();
  });

  it("returns undefined when no tracking image is present", () => {
    const entry = makeEntry("<html><body><p>No tracking here</p></body></html>");
    expect(deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry)).toBeUndefined();
  });

  it("returns undefined when tracking image URL has no recognizable referrer param", () => {
    const trackingUrl = "http://c.microsoft.com/trans_pixel.asp?TrackID=1&source=www&type=page";
    const entry = makeEntry(primaryHtml(trackingUrl));
    expect(deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry)).toBeUndefined();
  });

  it("extracts referrer from primary tracking image using r= param", () => {
    const referer = "http://www.microsoft.com/default.asp";
    const trackingUrl = `http://c.microsoft.com/trans_pixel.asp?TrackID=1&r=${encodeURIComponent(referer)}&source=www`;
    const entry = makeEntry(primaryHtml(trackingUrl));
    const result = deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry);
    expect(result).toEqual([["Referer", referer, "?"]]);
  });

  it("extracts referrer from secondary tracking image using r= param with &amp; separator", () => {
    const referer = "http://www.microsoft.com/products/";
    const trackingUrl = `http://c.microsoft.com/trans_pixel.asp?TrackID=1&amp;r=${encodeURIComponent(referer)}&amp;source=www`;
    const entry = makeEntry(secondaryHtml(trackingUrl));
    const result = deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry);
    expect(result).toEqual([["Referer", referer, "?"]]);
  });

  it("extracts referrer from complex URI param (toolbar asp.aspx path)", () => {
    const referer = "http://www.microsoft.com/toolbar/page";
    const subParams = `r=${encodeURIComponent(referer)}&h=www.microsoft.com`;
    const uri = encodeURIComponent(`/library/toolbar/3.0/asp.aspx?${subParams}`);
    const trackingUrl = `http://c.microsoft.com/trans_pixel.asp?TrackID=1&URI=${uri}&source=www`;
    const entry = makeEntry(primaryHtml(trackingUrl));
    const result = deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry);
    expect(result).toEqual([["Referer", referer, "?"]]);
  });

  it("prefers primary URL when both primary and secondary are present and equal", () => {
    const referer = "http://www.microsoft.com/shared/";
    const primaryUrl = `http://c.microsoft.com/trans_pixel.asp?TrackID=1&r=${encodeURIComponent(referer)}&source=www`;
    const secondaryUrl = `http://c.microsoft.com/trans_pixel.asp?TrackID=1&amp;r=${encodeURIComponent(referer)}&amp;source=www`;
    const entry = makeEntry(primaryHtml(primaryUrl) + secondaryHtml(secondaryUrl));
    const result = deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry);
    expect(result).toEqual([["Referer", referer, "?"]]);
  });

  it("throws when primary and secondary URLs resolve to different referrers", () => {
    const primaryUrl = `http://c.microsoft.com/trans_pixel.asp?r=${encodeURIComponent("http://www.microsoft.com/a")}&source=www`;
    const secondaryUrl = `http://c.microsoft.com/trans_pixel.asp?r=${encodeURIComponent("http://www.microsoft.com/b")}&amp;source=www`;
    const entry = makeEntry(primaryHtml(primaryUrl) + secondaryHtml(secondaryUrl));
    expect(() => deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry)).toThrow(
      "Inconsistent tracking URLs",
    );
  });

  it("works with a real example", () => {
    const primaryUrl = `http://c.microsoft.com/trans_pixel.asp?source=www&TYPE=' + tt + '&p=france_jeux_aoeexpansion&URI=%2flibrary%2ftoolbar%2f3.0%2fasp.aspx%3fmode%3dhead%26c%3d%2ffrance%2fjeux%2fjeux15.config%26h%3dwww%252Emicrosoft%252Ecom%26u%3d%252Ffrance%252Fjeux%252Faoeexpansion%252Fconfig%252Easp%26r%3dhttp%253A%252F%252Fwww%252Emicrosoft%252Ecom%252Ffrance%252Fjeux%252Faoeexpansion%252Fdefault%252Easp&GUID=1F4FC18C-F71E-47FB-8FC9-612F8EE59C61&r=http%3a%2f%2fwww.microsoft.com%2ffrance%2fjeux%2faoeexpansion%2fdefault.asp&lc=fr-fr`;
    const entry = makeEntry(primaryHtml(primaryUrl));
    const result = deriveRefererFromMicrosoftTrackingImage(entry as CaptureEntry);
    expect(result).toEqual([
      ["Referer", "http://www.microsoft.com/france/jeux/aoeexpansion/default.asp", "?"],
    ]);
  });
});
