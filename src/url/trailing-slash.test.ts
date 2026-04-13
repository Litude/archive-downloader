import { describe, it, expect } from "vitest";
import { isUrlTrailingSlashMatch, TrailingSlashParsingMode } from "./trailing-slash.js";

describe("isUrlTrailingSlashMatch", () => {
  describe("Strict mode", () => {
    it("matches when paths are identical", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games/",
          TrailingSlashParsingMode.Strict,
        ),
      ).toBe(true);
    });

    it("does not match when trailing slash differs", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games",
          TrailingSlashParsingMode.Strict,
        ),
      ).toBe(false);
    });

    it("matches case-insensitively", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/Games/",
          "http://example.com/games/",
          TrailingSlashParsingMode.Strict,
        ),
      ).toBe(true);
    });
  });

  describe("StrictWithValid mode", () => {
    it("throws when captureStatusCode is missing", () => {
      expect(() =>
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games/",
          TrailingSlashParsingMode.StrictWithValid,
        ),
      ).toThrow("captureStatusCode is required");
    });

    it("matches when paths are identical regardless of status code", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games/",
          TrailingSlashParsingMode.StrictWithValid,
          404,
        ),
      ).toBe(true);
    });

    it("matches trailing slash difference with 200 status", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games",
          TrailingSlashParsingMode.StrictWithValid,
          200,
        ),
      ).toBe(true);
    });

    it("does not match trailing slash difference with non-2xx status", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games",
          TrailingSlashParsingMode.StrictWithValid,
          404,
        ),
      ).toBe(false);
    });

    it("matches when request has trailing slash and capture does not with 200", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games",
          "http://example.com/games/",
          TrailingSlashParsingMode.StrictWithValid,
          200,
        ),
      ).toBe(true);
    });
  });

  describe("Lax mode", () => {
    it("always returns true", () => {
      expect(
        isUrlTrailingSlashMatch(
          "http://example.com/games/",
          "http://example.com/games",
          TrailingSlashParsingMode.Lax,
        ),
      ).toBe(true);
    });
  });
});
