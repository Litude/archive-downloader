import { TransformationInput, TransformationOutput } from "../types/transformation-types.js";

// Condition node types
type ExistsCondition = { exists: string };
type MatchesCondition = { param: string; matches: string };
type AndCondition = { and: FilterCondition[] };
type OrCondition = { or: FilterCondition[] };
type NotCondition = { not: FilterCondition };

type FilterCondition =
  | ExistsCondition
  | MatchesCondition
  | AndCondition
  | OrCondition
  | NotCondition;

interface QueryParamFilterOptions {
  condition: FilterCondition;
}

function evaluateCondition(
  condition: FilterCondition,
  queryParams: Record<string, string | null>,
): boolean {
  if ("exists" in condition) {
    const value = queryParams[condition.exists];
    return value !== undefined && value !== null && value !== "";
  }
  if ("param" in condition) {
    const value = queryParams[condition.param];
    if (value === undefined || value === null) {
      return false;
    }
    return new RegExp(condition.matches).test(value);
  }
  if ("and" in condition) {
    return condition.and.every((c) => evaluateCondition(c, queryParams));
  }
  if ("or" in condition) {
    return condition.or.some((c) => evaluateCondition(c, queryParams));
  }
  if ("not" in condition) {
    return !evaluateCondition(condition.not, queryParams);
  }
  throw new Error(`Unknown condition type: ${JSON.stringify(condition)}`);
}

function queryParamFilter(
  input: TransformationInput,
  inputOptions: Record<string, any>,
): TransformationOutput[] {
  const options = inputOptions as QueryParamFilterOptions;
  const passes = evaluateCondition(options.condition, input.queryParams);
  if (!passes) {
    return [];
  }
  return [{ content: input.content, queryParams: {} }];
}

export function validateOptions(options: Record<string, any>): options is QueryParamFilterOptions {
  return options != null && "condition" in options;
}

export const QueryParamFilter = {
  name: "queryParamFilter",
  transform: queryParamFilter,
  validateOptions: validateOptions,
};
