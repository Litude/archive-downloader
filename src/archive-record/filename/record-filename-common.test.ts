import { describe, it, expect } from "vitest";
import { parseRecordFormatFromArchiveFilename } from "./record-filename-common.js";

describe("parseRecordFormatFromArchiveFilename", () => {
  it("returns 'warc' for a .warc.gz filename", () => {
    expect(
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.warc.gz"),
    ).toBe("warc");
  });

  it("returns 'arc' for a .arc filename", () => {
    expect(parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.arc")).toBe(
      "arc",
    );
  });

  it("returns 'warc' for a .warc.zst filename", () => {
    expect(
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.warc.zst"),
    ).toBe("warc");
  });

  it("throws for an unknown extension", () => {
    expect(() =>
      parseRecordFormatFromArchiveFilename("CC-MAIN-20210301000000-00000-crawler.zip"),
    ).toThrow("Unknown record format");
  });
});
