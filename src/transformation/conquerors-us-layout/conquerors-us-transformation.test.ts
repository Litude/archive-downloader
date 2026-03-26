import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { ConquerorsUsTransformation } from "./conquerors-us-transformation.js";

const testDataDir = path.join(__dirname, "test_input");

const civAztecsNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/civilizations.asp",
  specialPage: "civ_aztecs" as const,
  f2: "aztecs",
};

const civHunsNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/civilizations.asp",
  specialPage: "civ_huns" as const,
  f2: "huns",
};

const civKoreansNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/civilizations.asp",
  specialPage: "civ_koreans" as const,
  f2: "koreans",
};

const civMayansNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/civilizations.asp",
  specialPage: "civ_mayans" as const,
  f2: "mayans",
};

const civSpanishNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/civilizations.asp",
  specialPage: "civ_spanish" as const,
  f2: "spanish",
};

const gameFeaturesNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/game_features.asp",
};

const defaultPageNormalizationOptions = {
  url: "http://www.microsoft.com/games/conquerors/default.asp",
};

describe("test normalization", () => {
  it("normalizes non-flash and flash aztecs civilization page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(path.join(testDataDir, "civ_aztecs_noflash_200110.html"));
    const flashPage = fs.readFileSync(path.join(testDataDir, "civ_aztecs_flash_200112.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      civAztecsNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      civAztecsNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes non-flash and flash huns civilization page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(path.join(testDataDir, "civ_huns_noflash_200111.html"));
    const flashPage = fs.readFileSync(path.join(testDataDir, "civ_huns_flash_200112.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      civHunsNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      civHunsNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes non-flash and flash korean civilization page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(path.join(testDataDir, "civ_korea_noflash_200412.html"));
    const flashPage = fs.readFileSync(path.join(testDataDir, "civ_korea_flash_200412.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      civKoreansNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      civKoreansNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes non-flash and flash mayans civilization page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(path.join(testDataDir, "civ_mayans_noflash_200111.html"));
    const flashPage = fs.readFileSync(path.join(testDataDir, "civ_mayans_flash_200112.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      civMayansNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      civMayansNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes non-flash and flash spanish civilization page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(path.join(testDataDir, "civ_spanish_noflash_200111.html"));
    const flashPage = fs.readFileSync(path.join(testDataDir, "civ_spanish_flash_200112.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      civSpanishNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      civSpanishNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes non-flash and flash the conquerors game features page to identical pages", () => {
    const nonFlashPage = fs.readFileSync(
      path.join(testDataDir, "game_features_noflash_200210.html"),
    );
    const flashPage = fs.readFileSync(path.join(testDataDir, "game_features_flash_200210.html"));
    const nonFlashResult = ConquerorsUsTransformation.normalize(
      nonFlashPage,
      gameFeaturesNormalizationOptions,
    );
    const flashResult = ConquerorsUsTransformation.normalize(
      flashPage,
      gameFeaturesNormalizationOptions,
    );
    expect(nonFlashResult.toString("latin1")).toBe(flashResult.toString("latin1"));
  });

  it("normalizes pages with strange f1 query parameters to match pages with regular f1 parameters 1", () => {
    const strangeQueryPage = fs.readFileSync(
      path.join(testDataDir, "default_query_strange_200202.html"),
    );
    const normalQueryPage = fs.readFileSync(
      path.join(testDataDir, "default_query_normal_200202.html"),
    );
    const strangeQueryResult = ConquerorsUsTransformation.normalize(
      strangeQueryPage,
      defaultPageNormalizationOptions,
    );
    const normalQueryResult = ConquerorsUsTransformation.normalize(
      normalQueryPage,
      defaultPageNormalizationOptions,
    );
    expect(strangeQueryResult.toString("latin1")).toBe(normalQueryResult.toString("latin1"));
  });

  it("normalizes pages with strange f1 query parameters to match pages with regular f1 parameters 2", () => {
    const strangeQueryPage = fs.readFileSync(
      path.join(testDataDir, "default_query_strange_200402.html"),
    );
    const normalQueryPage = fs.readFileSync(
      path.join(testDataDir, "default_query_normal_200402.html"),
    );
    const strangeQueryResult = ConquerorsUsTransformation.normalize(
      strangeQueryPage,
      defaultPageNormalizationOptions,
    );
    const normalQueryResult = ConquerorsUsTransformation.normalize(
      normalQueryPage,
      defaultPageNormalizationOptions,
    );
    expect(strangeQueryResult.toString("latin1")).toBe(normalQueryResult.toString("latin1"));
  });
});

// Note: We cannot test againt just any non-flash page because the normalization sets f1=no, and in some cases no flash page captures might have
// it as blank (or some other random value other than yes which is interpreted as no). Thus, we need to test with pages that we know have f1=no in the original capture.
// Another edge case that should not be tested is if part of the url was captialized

// The normalizer is supposed to lowercase all urls and ensure f1=no for non-flash pages

describe("test generating the original page back from input", () => {
  it("civ koreans flash page created through normalization and denormalization matches original", () => {
    const originalPage = fs.readFileSync(path.join(testDataDir, "civ_korea_flash_200412.html"));
    const normalizedResult = ConquerorsUsTransformation.normalize(
      originalPage,
      civKoreansNormalizationOptions,
    );
    const allGeneratedEntries = ConquerorsUsTransformation.generate(
      normalizedResult,
      civKoreansNormalizationOptions,
    );
    const generatedEntries = allGeneratedEntries.filter(
      (entry) => entry.queryParams["f1"] === "yes",
    );
    expect(generatedEntries.length).toBe(1);
    expect(generatedEntries[0].content.toString("latin1")).toBe(originalPage.toString("latin1"));
  });

  it("game features flash page created through normalization and denormalization matches original", () => {
    const originalPage = fs.readFileSync(path.join(testDataDir, "game_features_flash_200210.html"));
    const normalizedResult = ConquerorsUsTransformation.normalize(
      originalPage,
      gameFeaturesNormalizationOptions,
    );
    const allGeneratedEntries = ConquerorsUsTransformation.generate(
      normalizedResult,
      gameFeaturesNormalizationOptions,
    );
    const generatedEntries = allGeneratedEntries.filter(
      (entry) => entry.queryParams["f1"] === "yes",
    );
    expect(generatedEntries.length).toBe(1);
    expect(generatedEntries[0].content.toString("latin1")).toBe(originalPage.toString("latin1"));
  });

  it("game features non-flash page created through normalization and denormalization matches original", () => {
    const originalPage = fs.readFileSync(
      path.join(testDataDir, "game_features_noflash_regquery_200306.html"),
    );
    const normalizedResult = ConquerorsUsTransformation.normalize(
      originalPage,
      gameFeaturesNormalizationOptions,
    );
    const allGeneratedEntries = ConquerorsUsTransformation.generate(
      normalizedResult,
      gameFeaturesNormalizationOptions,
    );
    const generatedEntries = allGeneratedEntries.filter(
      (entry) => entry.queryParams["f1"] !== "yes",
    );
    expect(generatedEntries.length).toBe(1);
    expect(generatedEntries[0].content.toString("latin1")).toBe(originalPage.toString("latin1"));
  });
});
