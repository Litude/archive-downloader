import { TransformationInput, TransformationOutput } from "../types/transformation-types.js";

interface QueryParamTransformerOptions {
  paramName: string;
  valueRange?: { start: number; end: number };
  values?: string[];
  defaultValue?: string;
  replacements: {
    pattern: string;
    captureGroups?: number[];
    valueModifier?: string; // regex pattern to extract value from original capture for replacement, should contain a capture group for the value
    replacement?: string;
  }[];
}

function queryParamTransformer(
  input: TransformationInput,
  inputOptions: Record<string, any>,
): TransformationOutput[] {
  const options = validateOptions(inputOptions)
    ? inputOptions
    : (() => {
        throw new Error("Invalid options for QueryParamTransformer");
      })();
  const { paramName, valueRange, values, defaultValue, replacements } = options;

  const outputs: TransformationOutput[] = [];

  function applyReplacements(contentStr: string, replacementValue: string): string {
    for (const rule of replacements) {
      const regex = new RegExp(rule.pattern, "gd");
      const captureGroups = rule.captureGroups ?? [1];

      const matches = Array.from(contentStr.matchAll(regex));

      // Process matches in reverse order to maintain string indices
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const fullMatch = match[0];
        const indices = match.indices!;

        // Validate all capture groups exist
        for (const captureGroup of captureGroups) {
          if (captureGroup < 1 || captureGroup >= indices.length) {
            console.warn(`Capture group ${captureGroup} not found in pattern "${rule.pattern}"`);
            continue;
          }
        }

        const [fullStart, fullEnd] = indices[0];

        let replacement: string;

        if (rule.replacement) {
          // Custom replacement pattern - replace $1, $2, etc.
          replacement = rule.replacement;
          for (let groupNum = 1; groupNum < indices.length; groupNum++) {
            const shouldReplace = captureGroups.includes(groupNum);
            const captureValue = shouldReplace ? replacementValue : match[groupNum];
            replacement = replacement.replace(
              new RegExp(`\\$${groupNum}`, "g"),
              captureValue || "",
            );
          }
        } else {
          // Default: replace all specified capture groups in place
          // Build replacement by iterating through indices and replacing matching groups
          let offset = 0;
          let result = fullMatch;

          // Sort capture groups by position to replace in order
          const sortedGroups = [...captureGroups].sort((a, b) => indices[a][0] - indices[b][0]);
          const finalReplacementValue = rule.valueModifier
            ? (new RegExp(rule.valueModifier).exec(replacementValue)?.[1] ?? replacementValue)
            : replacementValue;

          for (const captureGroup of sortedGroups) {
            const [captureStart, captureEnd] = indices[captureGroup];
            const relativeStart = captureStart - fullStart + offset;
            const relativeEnd = captureEnd - fullStart + offset;
            const originalLength = captureEnd - captureStart;

            result =
              result.substring(0, relativeStart) +
              finalReplacementValue +
              result.substring(relativeEnd);
            offset += finalReplacementValue.length - originalLength;
          }

          replacement = result;
        }

        // Replace in the original string using indices
        contentStr =
          contentStr.substring(0, fullStart) + replacement + contentStr.substring(fullEnd);
      }
    }
    return contentStr;
  }

  if (values) {
    // Generate one output for each specified value
    for (const val of values) {
      const contentStr = applyReplacements(input.content.toString("latin1"), val);

      outputs.push({
        content: Buffer.from(contentStr, "latin1"),
        queryParams: { [paramName]: val },
      });
    }
  } else if (valueRange) {
    // Generate one output for each value in the range
    for (let value = valueRange.start; value <= valueRange.end; value++) {
      const contentStr = applyReplacements(input.content.toString("latin1"), String(value));

      outputs.push({
        content: Buffer.from(contentStr, "latin1"),
        queryParams: { [paramName]: String(value) },
      });
    }
  }

  // Generate default page if defaultValue is specified
  if (defaultValue !== undefined) {
    const contentStr = applyReplacements(input.content.toString("latin1"), defaultValue);

    outputs.push({
      content: Buffer.from(contentStr, "latin1"),
      queryParams: { [paramName]: null },
    });
  }

  return outputs;
}

export function validateOptions(options: unknown): options is QueryParamTransformerOptions {
  if (typeof options !== "object" || options === null) {
    return false;
  }

  const opts = options as Record<string, unknown>;

  if (typeof opts.paramName !== "string") {
    return false;
  }

  if (!opts.values && !opts.valueRange) {
    return false;
  }

  if (opts.valueRange) {
    if (typeof opts.valueRange !== "object" || opts.valueRange === null) {
      return false;
    }
    const valueRange = opts.valueRange as Record<string, unknown>;
    if (typeof valueRange.start !== "number" || typeof valueRange.end !== "number") {
      return false;
    }
  } else {
    if (!Array.isArray(opts.values)) {
      return false;
    }
    for (const val of opts.values) {
      if (typeof val !== "string") {
        return false;
      }
    }
  }

  if (!Array.isArray(opts.replacements)) {
    return false;
  }
  for (const rule of opts.replacements) {
    if (typeof rule !== "object" || rule === null) {
      return false;
    }
    const r = rule as Record<string, unknown>;
    if (typeof r.pattern !== "string") {
      return false;
    }
    if (r.captureGroups !== undefined) {
      if (!Array.isArray(r.captureGroups)) {
        return false;
      }
      for (const group of r.captureGroups) {
        if (typeof group !== "number") {
          return false;
        }
      }
    }
    if (r.replacement !== undefined && typeof r.replacement !== "string") {
      return false;
    }
  }

  return true;
}

export const QueryParamTransformation = {
  name: "queryParamTransformation",
  transform: queryParamTransformer,
  validateOptions: validateOptions,
};
