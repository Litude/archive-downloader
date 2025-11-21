import fs from 'fs';
import path from 'path';
import { TransformationInput, TransformationOutput } from '../../types/transformation-types';

const htmlDir = "html";

export interface ConquerorsUsNormalizationOptions {
    url: string;
    specialPage?: "default" | "civ_aztecs" | "civ_huns" | "civ_koreans" | "civ_mayans" | "civ_spanish";
    f2?: string;
    f3?: string;
    f4?: string;
}

type LayoutType = "html" | "flash";

const htmlMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, 'menu_noflash.html'), 'latin1');
const flashMenuStr = fs.readFileSync(path.join(__dirname, htmlDir, 'menu_flash.html'), 'latin1');

const soundCivAztecsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_aztecs_flash.html'), 'latin1');
const soundCivHunsFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_huns_flash.html'), 'latin1');
const soundCivKoreansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_koreans_flash.html'), 'latin1');
const soundCivMayansFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_mayans_flash.html'), 'latin1');
const soundCivSpanishFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_spanish_flash.html'), 'latin1');
const soundCivAztecsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_aztecs_noflash.html'), 'latin1');
const soundCivHunsNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_huns_noflash.html'), 'latin1');
const soundCivKoreansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_koreans_noflash.html'), 'latin1');
const soundCivMayansNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_mayans_noflash.html'), 'latin1');
const soundCivSpanishNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_civ_spanish_noflash.html'), 'latin1');

const soundDefaultFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_default_flash.html'), 'latin1');
const soundDefaultNoFlashStr = fs.readFileSync(path.join(__dirname, htmlDir, 'snd_default_noflash.html'), 'latin1');

const tagIdentifier = 'DLNORMALIZATION';

const menuReplacementString = `<!-- ${tagIdentifier}: INCLUDE MENU -->`
const layoutSwitchReplacementString = `<!-- ${tagIdentifier}: INCLUDE SWITCH_LAYOUT -->`
const layoutSoundEffectReplacementString = `<!-- ${tagIdentifier}: INCLUDE SOUND_EFFECT -->`
const flashNormalizationTag = `${tagIdentifier}_FLASHENABLED`;

const switchReplacementRegex1 = new RegExp(/ \r\n    <a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" CLASS="ROLL">HTML Site<\/a>/, "i");
const switchReplacementRegex2 = new RegExp(/\r\n<a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" CLASS="ROLL">Flash Enhanced Site<\/a>/, "i");


// Normalize menu, might be either HTML or flash so we just normalize both (the other one will not match anything)
function normalizeMenu(inputString: string): string {
    let outputString = inputString.replace(htmlMenuStr, menuReplacementString);
    outputString = outputString.replace(flashMenuStr, menuReplacementString);
    if (outputString === inputString) {
        throw new Error("Menu normalization failed, no matches found!");
    }
    return outputString;
}

function generateMenu(inputString: string, layout: LayoutType): string {
    let outputString = inputString;
    if (layout === "flash") {
        outputString = outputString.replace(new RegExp(menuReplacementString, 'g'), flashMenuStr);
    } else {
        outputString = outputString.replace(new RegExp(menuReplacementString, 'g'), htmlMenuStr);
    }
    if (outputString === inputString) {
        throw new Error("Menu generation failed, no matches found!");
    }
    return outputString;
}

// Normalize layout HTML/Flash menu toggle links
function normalizeLayoutToggleLinks(inputString: string): string {
    let outputString = inputString.replace(switchReplacementRegex1, layoutSwitchReplacementString)
                           .replace(switchReplacementRegex2, layoutSwitchReplacementString);
    if (outputString === inputString) {
        throw new Error("Layout toggle link normalization failed, no matches found!");
    }
    return outputString;
}

// This can either be a full url or just the path portion
function parseUrl(urlString: string): string {
    try {
        const url = new URL(urlString);
        return url.pathname;
    } catch {
        // Not a full url, assume it's just the path
        return urlString;
    }
}

function generateLayoutSwitchLinks(inputString: string, layout: LayoutType, mainUrl: string, { f2, f3, f4 }: { f2?: string, f3?: string, f4?: string }): string {
    let outputString = inputString;
    const urlPath = parseUrl(mainUrl);
    if (layout === "flash") {
        outputString = outputString.replace(new RegExp(layoutSwitchReplacementString, 'g'), 
            ` \r\n    <a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=no&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" CLASS="ROLL">HTML Site</a>`);
    } else {
        outputString = outputString.replace(new RegExp(layoutSwitchReplacementString, 'g'), 
            `\r\n<a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=yes&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" CLASS="ROLL">Flash Enhanced Site</a>`);
    }
    if (outputString === inputString) {
        throw new Error("Layout switch link generation failed, no matches found!");
    }
    return outputString;
}

// Normalize all urls with the query parameter f1=<anything> to f1=DLNORMALIZATION_FLASHENABLED
function normalizeQueryParameterLinks(inputString: string): string {
    let outputString = inputString.replace(/\?f1=(?:[^"&]*(?:&quot;[^"&]*)*)/g, `?f1=${flashNormalizationTag}`);
    // Hacks for special captures which are slightly corrupt due to quotes in query params:
    outputString = outputString.replaceAll(`?f1=${flashNormalizationTag}"Target="_top`, `?f1=${flashNormalizationTag}`);
    outputString = outputString.replaceAll(`?f1=${flashNormalizationTag}"target=new`, `?f1=${flashNormalizationTag}`);
    if (outputString === inputString) {
        throw new Error("Query parameter f1 normalization failed, no matches found!");
    }
    return outputString;
}

function generateQueryParameterLinks(inputString: string, layout: LayoutType): string {
    let outputString = inputString;
    if (layout === "flash") {
        outputString = outputString.replace(new RegExp(`\\?f1=${flashNormalizationTag}`, 'g'), `?f1=yes`);
    } else {
        outputString = outputString.replace(new RegExp(`\\?f1=${flashNormalizationTag}`, 'g'), `?f1=no`);
    }
    if (outputString === inputString) {
        throw new Error("Query parameter f1 generation failed, no matches found!");
    }
    return outputString;
}

function normalizeSoundEffectLinks(inputString: string, specialPage?: "default" | "civ_aztecs" | "civ_huns" | "civ_koreans" | "civ_mayans" | "civ_spanish"): string {
    if (!specialPage) {
        return inputString;
    }

    let outputString = inputString;

    if (specialPage === "default") {
        outputString = outputString.replace(soundDefaultFlashStr, layoutSoundEffectReplacementString)
                           .replace(soundDefaultNoFlashStr, layoutSoundEffectReplacementString);
    }
    else if (specialPage === "civ_aztecs") {
        outputString = outputString.replace(soundCivAztecsFlashStr, layoutSoundEffectReplacementString)
                           .replace(soundCivAztecsNoFlashStr, layoutSoundEffectReplacementString);
    }
    else if (specialPage === "civ_huns") {
        outputString = outputString.replace(soundCivHunsFlashStr, layoutSoundEffectReplacementString)
                                   .replace(soundCivHunsNoFlashStr, layoutSoundEffectReplacementString);
    }
    else if (specialPage === "civ_koreans") {
        outputString = outputString.replace(soundCivKoreansFlashStr, layoutSoundEffectReplacementString)
                                   .replace(soundCivKoreansNoFlashStr, layoutSoundEffectReplacementString);
    }
    else if (specialPage === "civ_mayans") {
        outputString = outputString.replace(soundCivMayansFlashStr, layoutSoundEffectReplacementString)
                                   .replace(soundCivMayansNoFlashStr, layoutSoundEffectReplacementString);
    }
    else if (specialPage === "civ_spanish") {
        outputString = outputString.replace(soundCivSpanishFlashStr, layoutSoundEffectReplacementString)
                                   .replace(soundCivSpanishNoFlashStr, layoutSoundEffectReplacementString);
    }

    if (outputString === inputString) {
        throw new Error("Sound effect normalization failed, no matches found!");
    }
    return outputString;
}


function generateSoundEffectLinks(inputString: string, layout: LayoutType, specialPage?: "default" | "civ_aztecs" | "civ_huns" | "civ_koreans" | "civ_mayans" | "civ_spanish"): string {
    if (!specialPage) {
        return inputString;
    }

    let outputString = inputString;

    if (specialPage === "default") {
        const replacement = layout === "flash" ? soundDefaultFlashStr : soundDefaultNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }
    else if (specialPage === "civ_aztecs") {
        const replacement = layout === "flash" ? soundCivAztecsFlashStr : soundCivAztecsNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }
    else if (specialPage === "civ_huns") {
        const replacement = layout === "flash" ? soundCivHunsFlashStr : soundCivHunsNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }
    else if (specialPage === "civ_koreans") {
        const replacement = layout === "flash" ? soundCivKoreansFlashStr : soundCivKoreansNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }
    else if (specialPage === "civ_mayans") {
        const replacement = layout === "flash" ? soundCivMayansFlashStr : soundCivMayansNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }
    else if (specialPage === "civ_spanish") {
        const replacement = layout === "flash" ? soundCivSpanishFlashStr : soundCivSpanishNoFlashStr;
        outputString = outputString.replace(new RegExp(layoutSoundEffectReplacementString, 'g'), replacement);
    }

    if (outputString === inputString) {
        throw new Error("Sound effect generation failed, no matches found!");
    }
    return outputString;
}

function normalizeTheConquerorsUsWebsite(entry: Buffer, siteOptions: ConquerorsUsNormalizationOptions): Buffer {
    const newEntry = entry;
    const contentStr = newEntry.toString('latin1');
    let normalizedContent = contentStr;
    normalizedContent = normalizeMenu(normalizedContent);
    normalizedContent = normalizeLayoutToggleLinks(normalizedContent);
    normalizedContent = normalizeQueryParameterLinks(normalizedContent);
    normalizedContent = normalizeSoundEffectLinks(normalizedContent, siteOptions.specialPage);

    const buffer = Buffer.from(normalizedContent, 'latin1');
    return buffer;
}

function createSiteLayoutVersion(content: Buffer, layout: LayoutType, siteOptions: ConquerorsUsNormalizationOptions): Buffer {
    let contentStr = content.toString('latin1');
    contentStr = generateMenu(contentStr, layout);
    contentStr = generateLayoutSwitchLinks(contentStr, layout, siteOptions.url, { f2: siteOptions.f2, f3: siteOptions.f3, f4: siteOptions.f4 });
    contentStr = generateQueryParameterLinks(contentStr, layout);
    contentStr = generateSoundEffectLinks(contentStr, layout, siteOptions.specialPage);
    return Buffer.from(contentStr, 'latin1');
}

function generateTheConquerorsUsWebsiteVariants(
  entry: Buffer,
  siteOptions: ConquerorsUsNormalizationOptions
): {
  content: Buffer,
  queryParams: Record<string, string | null>
}[] {
  const flashEnabledEntry = createSiteLayoutVersion(entry, "flash", siteOptions);
  const noFlashEntry = createSiteLayoutVersion(entry, "html", siteOptions);

    return [{
        content: noFlashEntry,
        queryParams: { f1: null} as Record<string, string | null>
    },
    {
        content: flashEnabledEntry,
        queryParams: { f1: "yes" } as Record<string, string | null>
    }];
}

function transformTheConquerorsUsWebsite(
  entry: TransformationInput,
  params: Record<string, any>): TransformationOutput[] {

  const normalizedContent = normalizeTheConquerorsUsWebsite(entry.content, params as ConquerorsUsNormalizationOptions);
  const allGeneratedEntries = generateTheConquerorsUsWebsiteVariants(normalizedContent, params as ConquerorsUsNormalizationOptions);
  return allGeneratedEntries;
}

function validateOptions(options: Record<string, any>): boolean {
    return true;
}

export const ConquerorsUsTransformation = {
  name: "ConquerorsUsLayoutTransformation",
  normalize: normalizeTheConquerorsUsWebsite,
  generate: generateTheConquerorsUsWebsiteVariants,
  transform: transformTheConquerorsUsWebsite,
  validateOptions: validateOptions
};
