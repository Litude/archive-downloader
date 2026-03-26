import path from "path";
import { TransformationInput, TransformationOutput } from "../../types/transformation-types.js";
import {
  ConquerorsUsLayoutNormalizationVariant,
  ConquerorsUsLayoutSpecialPage,
} from "./layout_transforms.js";
import { ConquerorsUsLayoutTransforms } from "./layout_transforms.js";

type LayoutType = "html" | "flash";

export interface ConquerorsUsNormalizationOptions {
  url: string;
  variant?: ConquerorsUsLayoutNormalizationVariant; // asp is default, aspx has special handling
  specialPage?: ConquerorsUsLayoutSpecialPage;
  f2?: string;
  f3?: string;
  f4?: string;
}

const tagIdentifier = "DLNORMALIZATION";

const menuReplacementString = `<!-- ${tagIdentifier}: INCLUDE MENU -->`;
const layoutSwitchReplacementString = `<!-- ${tagIdentifier}: INCLUDE SWITCH_LAYOUT -->`;
const layoutSoundEffectReplacementString = `<!-- ${tagIdentifier}: INCLUDE SOUND_EFFECT -->`;
const flashNormalizationTag = `${tagIdentifier}_FLASHENABLED`;

const aspSwitchReplacementRegex1 = new RegExp(
  / \r\n {4}<a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" CLASS="ROLL">HTML Site<\/a>/,
  "i",
);
const aspSwitchReplacementRegex2 = new RegExp(
  /\r\n<a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" CLASS="ROLL">Flash Enhanced Site<\/a>/,
  "i",
);
const aspxSwitchReplacementRegex1 = new RegExp(
  /\r\n {20}<a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" class="ROLL">HTML\r\n {24}Site<\/a>/,
  "i",
);
const aspxSwitchReplacementRegex2 = new RegExp(
  /\r\n {20}<a href="\/games\/conquerors\/.+\?f1=.*&f2=.*&f3=.*&f4=.*" class="ROLL">\r\n {24}Flash Enhanced Site<\/a>/,
  "i",
);

// Normalize menu, might be either HTML or flash so we just normalize both (the other one will not match anything)
function normalizeMenu(
  inputString: string,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
  specialPage?: ConquerorsUsLayoutSpecialPage,
): string {
  let outputString = inputString;
  if (
    variant === "aspx" &&
    [
      "campaigns",
      "civilizations",
      "civ_aztecs",
      "civ_huns",
      "civ_koreans",
      "civ_mayans",
      "civ_spanish",
    ].includes(specialPage ?? "")
  ) {
    // aspx campaigns and civilization pages have a slightly differently formatted html menu
    outputString = outputString.replace(
      ConquerorsUsLayoutTransforms.AspxSpecialHtmlMenu,
      menuReplacementString,
    );
    outputString = outputString.replace(
      ConquerorsUsLayoutTransforms.Menu[variant].flash,
      menuReplacementString,
    );
  } else {
    outputString = outputString.replace(
      ConquerorsUsLayoutTransforms.Menu[variant].html,
      menuReplacementString,
    );
    outputString = outputString.replace(
      ConquerorsUsLayoutTransforms.Menu[variant].flash,
      menuReplacementString,
    );
  }
  if (outputString === inputString) {
    throw new Error("Menu normalization failed, no matches found!");
  }
  return outputString;
}

function generateMenu(
  inputString: string,
  layout: LayoutType,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
  specialPage?: ConquerorsUsLayoutSpecialPage,
): string {
  let outputString = inputString;
  if (layout === "flash") {
    outputString = outputString.replace(
      new RegExp(menuReplacementString, "g"),
      ConquerorsUsLayoutTransforms.Menu[variant].flash,
    );
  } else {
    if (
      variant === "aspx" &&
      [
        "campaigns",
        "civilizations",
        "civ_aztecs",
        "civ_huns",
        "civ_koreans",
        "civ_mayans",
        "civ_spanish",
      ].includes(specialPage ?? "")
    ) {
      outputString = outputString.replace(
        new RegExp(menuReplacementString, "g"),
        ConquerorsUsLayoutTransforms.AspxSpecialHtmlMenu,
      );
    } else {
      outputString = outputString.replace(
        new RegExp(menuReplacementString, "g"),
        ConquerorsUsLayoutTransforms.Menu[variant].html,
      );
    }
  }
  if (outputString === inputString) {
    throw new Error("Menu generation failed, no matches found!");
  }
  return outputString;
}

// Normalize layout HTML/Flash menu toggle links
function normalizeLayoutToggleLinks(
  inputString: string,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
): string {
  let outputString = inputString;
  if (variant === "asp") {
    outputString = outputString
      .replace(aspSwitchReplacementRegex1, layoutSwitchReplacementString)
      .replace(aspSwitchReplacementRegex2, layoutSwitchReplacementString);
  } else if (variant === "aspx") {
    outputString = outputString
      .replace(aspxSwitchReplacementRegex1, layoutSwitchReplacementString)
      .replace(aspxSwitchReplacementRegex2, layoutSwitchReplacementString);
  }
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

function generateLayoutSwitchLinks(
  inputString: string,
  layout: LayoutType,
  mainUrl: string,
  { f2, f3, f4 }: { f2?: string; f3?: string; f4?: string },
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
): string {
  let outputString = inputString;
  const urlPath = parseUrl(mainUrl);
  if (variant === "aspx") {
    if (layout === "flash") {
      outputString = outputString.replace(
        new RegExp(layoutSwitchReplacementString, "g"),
        `\r\n                    <a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=no&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" class="ROLL">HTML\r\n                        Site</a>`,
      );
    } else {
      outputString = outputString.replace(
        new RegExp(layoutSwitchReplacementString, "g"),
        `\r\n                    <a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=yes&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" class="ROLL">\r\n                        Flash Enhanced Site</a>`,
      );
    }
  } else {
    if (layout === "flash") {
      outputString = outputString.replace(
        new RegExp(layoutSwitchReplacementString, "g"),
        ` \r\n    <a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=no&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" CLASS="ROLL">HTML Site</a>`,
      );
    } else {
      outputString = outputString.replace(
        new RegExp(layoutSwitchReplacementString, "g"),
        `\r\n<a href="/games/conquerors/${path.basename(urlPath).toLowerCase()}?f1=yes&f2=${f2 ?? ""}&f3=${f3 ?? ""}&f4=${f4 ?? ""}" CLASS="ROLL">Flash Enhanced Site</a>`,
      );
    }
  }
  if (outputString === inputString) {
    throw new Error("Layout switch link generation failed, no matches found!");
  }
  return outputString;
}

// Normalize all urls with the query parameter f1=<anything> to f1=DLNORMALIZATION_FLASHENABLED
function normalizeQueryParameterLinks(inputString: string): string {
  let outputString = inputString.replace(
    /\?f1=(?:[^"&]*(?:&quot;[^"&]*)*)/g,
    `?f1=${flashNormalizationTag}`,
  );
  // Hacks for special captures which are slightly corrupt due to quotes in query params:
  outputString = outputString.replaceAll(
    `?f1=${flashNormalizationTag}"Target="_top`,
    `?f1=${flashNormalizationTag}`,
  );
  outputString = outputString.replaceAll(
    `?f1=${flashNormalizationTag}"target=new`,
    `?f1=${flashNormalizationTag}`,
  );
  if (outputString === inputString) {
    throw new Error("Query parameter f1 normalization failed, no matches found!");
  }
  return outputString;
}

function generateQueryParameterLinks(inputString: string, layout: LayoutType): string {
  let outputString = inputString;
  if (layout === "flash") {
    outputString = outputString.replace(
      new RegExp(`\\?f1=${flashNormalizationTag}`, "g"),
      "?f1=yes",
    );
  } else {
    outputString = outputString.replace(
      new RegExp(`\\?f1=${flashNormalizationTag}`, "g"),
      "?f1=no",
    );
  }
  if (outputString === inputString) {
    throw new Error("Query parameter f1 generation failed, no matches found!");
  }
  return outputString;
}

function normalizeSoundEffectLinks(
  inputString: string,
  specialPage?: ConquerorsUsLayoutSpecialPage,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
): string {
  if (!specialPage || specialPage === "campaigns" || specialPage === "civilizations") {
    return inputString;
  }

  let outputString = inputString;

  const flashReplacementString = ConquerorsUsLayoutTransforms.Sound[specialPage][variant].flash;
  const htmlReplacementString = ConquerorsUsLayoutTransforms.Sound[specialPage][variant].html;

  outputString = outputString
    .replace(flashReplacementString, layoutSoundEffectReplacementString)
    .replace(htmlReplacementString, layoutSoundEffectReplacementString);

  if (outputString === inputString) {
    throw new Error("Sound effect normalization failed, no matches found!");
  }
  return outputString;
}

function generateSoundEffectLinks(
  inputString: string,
  layout: LayoutType,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
  specialPage?: ConquerorsUsLayoutSpecialPage,
): string {
  if (!specialPage || specialPage === "campaigns" || specialPage === "civilizations") {
    return inputString;
  }

  let outputString = inputString;

  const replacement = ConquerorsUsLayoutTransforms.Sound[specialPage][variant][layout];
  outputString = outputString.replace(
    new RegExp(layoutSoundEffectReplacementString, "g"),
    replacement,
  );

  if (outputString === inputString) {
    throw new Error("Sound effect generation failed, no matches found!");
  }
  return outputString;
}

function normalizeTheConquerorsUsWebsite(
  entry: Buffer,
  siteOptions: ConquerorsUsNormalizationOptions,
): Buffer {
  const newEntry = entry;
  const contentStr = newEntry.toString("latin1");
  let normalizedContent = contentStr;
  normalizedContent = normalizeMenu(
    normalizedContent,
    siteOptions.variant,
    siteOptions.specialPage,
  );
  normalizedContent = normalizeLayoutToggleLinks(normalizedContent, siteOptions.variant);
  normalizedContent = normalizeQueryParameterLinks(normalizedContent);
  normalizedContent = normalizeSoundEffectLinks(
    normalizedContent,
    siteOptions.specialPage,
    siteOptions.variant,
  );

  const buffer = Buffer.from(normalizedContent, "latin1");
  return buffer;
}

function createSiteLayoutVersion(
  content: Buffer,
  layout: LayoutType,
  siteOptions: ConquerorsUsNormalizationOptions,
  variant: ConquerorsUsLayoutNormalizationVariant = "asp",
): Buffer {
  let contentStr = content.toString("latin1");
  contentStr = generateMenu(contentStr, layout, variant, siteOptions.specialPage);
  contentStr = generateLayoutSwitchLinks(
    contentStr,
    layout,
    siteOptions.url,
    { f2: siteOptions.f2, f3: siteOptions.f3, f4: siteOptions.f4 },
    variant,
  );
  contentStr = generateQueryParameterLinks(contentStr, layout);
  contentStr = generateSoundEffectLinks(contentStr, layout, variant, siteOptions.specialPage);
  return Buffer.from(contentStr, "latin1");
}

function generateTheConquerorsUsWebsiteVariants(
  entry: Buffer,
  siteOptions: ConquerorsUsNormalizationOptions,
): {
  content: Buffer;
  queryParams: Record<string, string | null>;
}[] {
  const flashEnabledEntry = createSiteLayoutVersion(
    entry,
    "flash",
    siteOptions,
    siteOptions.variant,
  );
  const noFlashEntry = createSiteLayoutVersion(entry, "html", siteOptions, siteOptions.variant);

  const otherParams = {
    f2: siteOptions.f2 ?? undefined,
    f3: siteOptions.f3 ?? undefined,
    f4: siteOptions.f4 ?? undefined,
  };
  Object.keys(otherParams).forEach((key) => {
    if (otherParams[key as keyof typeof otherParams] === undefined) {
      delete otherParams[key as keyof typeof otherParams];
    }
  });

  return [
    {
      content: noFlashEntry,
      queryParams: {
        f1: null,
        ...otherParams,
      } as Record<string, string | null>,
    },
    {
      content: flashEnabledEntry,
      queryParams: {
        f1: "yes",
        ...otherParams,
      } as Record<string, string | null>,
    },
  ];
}

function transformTheConquerorsUsWebsite(
  entry: TransformationInput,
  params: Record<string, any>,
): TransformationOutput[] {
  const options = params as ConquerorsUsNormalizationOptions;
  const normalizedContent = normalizeTheConquerorsUsWebsite(entry.content, options);
  const allGeneratedEntries = generateTheConquerorsUsWebsiteVariants(normalizedContent, options);
  return allGeneratedEntries;
}

function validateOptions(_options: Record<string, any>): boolean {
  return true;
}

export const ConquerorsUsTransformation = {
  name: "ConquerorsUsLayoutTransformation",
  normalize: normalizeTheConquerorsUsWebsite,
  generate: generateTheConquerorsUsWebsiteVariants,
  transform: transformTheConquerorsUsWebsite,
  validateOptions: validateOptions,
};
