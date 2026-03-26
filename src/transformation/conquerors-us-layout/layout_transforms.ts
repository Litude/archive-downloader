import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlDir = "html";

export type ConquerorsUsLayoutNormalizationEntry = {
    asp: {
        flash: string;
        html: string;
    };
    aspx: {
        flash: string;
        html: string;
    }
}
export type ConquerorsUsLayoutNormalizationVariant = "asp" | "aspx";
export type ConquerorsUsLayoutSpecialPage = "default" | "campaigns" | "civilizations" | "civ_aztecs" | "civ_huns" | "civ_koreans" | "civ_mayans" | "civ_spanish"

const aspHtmlMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_menu_noflash.html"), "latin1");
const aspFlashMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_menu_flash.html"), "latin1");
const aspxHtmlMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_menu_noflash.html"), "latin1");
// Campaigns and civilization screens have a slightly different menu layout
const aspxHtmlMenuSpecialStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_menu_noflash_special.html"), "latin1");
const aspxFlashMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_menu_flash.html"), "latin1");

const aspSoundCivAztecsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_aztecs_flash.html"), "latin1");
const aspSoundCivHunsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_huns_flash.html"), "latin1");
const aspSoundCivKoreansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_koreans_flash.html"), "latin1");
const aspSoundCivMayansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_mayans_flash.html"), "latin1");
const aspSoundCivSpanishFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_spanish_flash.html"), "latin1");
const aspSoundCivAztecsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_aztecs_noflash.html"), "latin1");
const aspSoundCivHunsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_huns_noflash.html"), "latin1");
const aspSoundCivKoreansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_koreans_noflash.html"), "latin1");
const aspSoundCivMayansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_mayans_noflash.html"), "latin1");
const aspSoundCivSpanishNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_civ_spanish_noflash.html"), "latin1");
const aspxSoundCivAztecsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_aztecs_flash.html"), "latin1");
const aspxSoundCivHunsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_huns_flash.html"), "latin1");
const aspxSoundCivKoreansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_koreans_flash.html"), "latin1");
const aspxSoundCivMayansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_mayans_flash.html"), "latin1");
const aspxSoundCivSpanishFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_spanish_flash.html"), "latin1");
const aspxSoundCivAztecsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_aztecs_noflash.html"), "latin1");
const aspxSoundCivHunsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_huns_noflash.html"), "latin1");
const aspxSoundCivKoreansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_koreans_noflash.html"), "latin1");
const aspxSoundCivMayansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_mayans_noflash.html"), "latin1");
const aspxSoundCivSpanishNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_civ_spanish_noflash.html"), "latin1");

const aspSoundDefaultFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_default_flash.html"), "latin1");
const aspSoundDefaultNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "asp_snd_default_noflash.html"), "latin1");
const aspxSoundDefaultFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_default_flash.html"), "latin1");
const aspxSoundDefaultNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, "aspx_snd_default_noflash.html"), "latin1");

const menuNormalizationEntry: ConquerorsUsLayoutNormalizationEntry = {
  asp: {
    flash: aspFlashMenuStr,
    html: aspHtmlMenuStr,
  },
  aspx: {
    flash: aspxFlashMenuStr,
    html: aspxHtmlMenuStr,
  },
};

const soundNormalizationEntries: Record<"default" | "civ_aztecs" | "civ_huns" | "civ_koreans" | "civ_mayans" | "civ_spanish", ConquerorsUsLayoutNormalizationEntry> = {
  "default": {
    asp: {
      flash: aspSoundDefaultFlashStr,
      html: aspSoundDefaultNoFlashStr,
    },
    aspx: {
      flash: aspxSoundDefaultFlashStr,
      html: aspxSoundDefaultNoFlashStr,
    },
  },
  "civ_aztecs": {
    asp: {
      flash: aspSoundCivAztecsFlashStr,
      html: aspSoundCivAztecsNoFlashStr,
    },
    aspx: {
      flash: aspxSoundCivAztecsFlashStr,
      html: aspxSoundCivAztecsNoFlashStr,
    },
  },
  "civ_huns": {
    asp: {
      flash: aspSoundCivHunsFlashStr,
      html: aspSoundCivHunsNoFlashStr,
    },
    aspx: {
      flash: aspxSoundCivHunsFlashStr,
      html: aspxSoundCivHunsNoFlashStr,
    },
  },
  "civ_koreans": {
    asp: {
      flash: aspSoundCivKoreansFlashStr,
      html: aspSoundCivKoreansNoFlashStr,
    },
    aspx: {
      flash: aspxSoundCivKoreansFlashStr,
      html: aspxSoundCivKoreansNoFlashStr,
    },
  },
  "civ_mayans": {
    asp: {
      flash: aspSoundCivMayansFlashStr,
      html: aspSoundCivMayansNoFlashStr,
    },
    aspx: {
      flash: aspxSoundCivMayansFlashStr,
      html: aspxSoundCivMayansNoFlashStr,
    },
  },
  "civ_spanish": {
    asp: {
      flash: aspSoundCivSpanishFlashStr,
      html: aspSoundCivSpanishNoFlashStr,
    },
    aspx: {
      flash: aspxSoundCivSpanishFlashStr,
      html: aspxSoundCivSpanishNoFlashStr,
    },
  },
};

export const ConquerorsUsLayoutTransforms = {
  Menu: menuNormalizationEntry,
  Sound: soundNormalizationEntries,
  AspxSpecialHtmlMenu: aspxHtmlMenuSpecialStr,
};
