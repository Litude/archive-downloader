import { TransformationInput, TransformationOutput } from "../types/transformation-types.js";

export interface RegexTransformation {
  pattern: string;
  replacement: string;
  flags?: string;
  transforms?: string[];
}

export interface RegexTransformationOptions {
  transforms: RegexTransformation[];
}

type Transform = (captureGroups: string[]) => string[];

const TRANSFORMS: Record<string, Transform> = {
  captureToLowerCase: (groups) => groups.map((g) => g.toLowerCase()),
  captureToUpperCase: (groups) => groups.map((g) => g.toUpperCase()),
};

function applyTransforms(captureGroups: string[], transformNames?: string[]): string[] {
  if (!transformNames || !transformNames.length) {
    return captureGroups;
  }

  let result = captureGroups;
  for (const transformName of transformNames) {
    const transform = TRANSFORMS[transformName];
    if (transform) {
      result = transform(result);
    }
  }
  return result;
}

function applyRegexNormalizationRules(
  content: Buffer,
  normalizations: RegexTransformation[],
): Buffer | null {
  let htmlContent = content.toString("latin1");
  let contentChanged = false;

  for (const norm of normalizations) {
    const regex = new RegExp(norm.pattern, norm.flags || "g");
    const newHtmlContent = htmlContent.replace(regex, (...args) => {
      contentChanged = true;
      const captureGroups = args.slice(1, -2); // Extract all capture groups

      const transformedGroups = applyTransforms(captureGroups, norm.transforms);

      // Replace $1, $2, etc. in replacement string
      let result = norm.replacement ?? "";
      transformedGroups.forEach((group, index) => {
        result = result.replace(new RegExp(`\\$${index + 1}`, "g"), group);
      });

      return result;
    });
    htmlContent = newHtmlContent;
  }
  return contentChanged ? Buffer.from(htmlContent, "latin1") : null;
}

function transformInputs(
  input: TransformationInput,
  transformationOptions: Record<string, any>,
): TransformationOutput[] {
  const normalizedContent = applyRegexNormalizationRules(
    input.content,
    (transformationOptions as RegexTransformationOptions).transforms,
  );
  return [
    {
      content: normalizedContent ?? input.content,
      queryParams: {},
    },
  ];
}

export const RegexNormalizer = {
  name: "RegexNormalizer",
  normalize: applyRegexNormalizationRules,
  transform: transformInputs,
} as const;
