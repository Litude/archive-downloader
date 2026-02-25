import { Transformation, TransformationInput, TransformationOutput, TransformationProvider } from "../types/transformation-types";
import { TransformationJson } from "../types/website-types";
import { computeSha256 } from "../utils/hash";
import { ConquerorsUsTransformation } from "./conquerors-us-layout/conquerors-us-transformation";
import { QueryParamTransformation } from "./query-param-transformation";
import { QueryParamFilter } from "./query-param-filter";
import { TrackingImageNormalizer } from "./tracking-img-transformation";

export function applyTransformationPipeline(
  initialBuffers: { sha256: string; content: Buffer }[],
  transformations: Transformation[]
): TransformationInput[] {
  
  // Start with initial inputs (one per unique sha256)
  let currentInputs: TransformationInput[] = initialBuffers.map(({ sha256, content }) => ({
    content,
    sourceSha256Values: [sha256],
    queryParams: {},
  }));

  // Apply each transformation in sequence
  for (const { function: transformation, options, name } of transformations) {
    console.log(`Applying transformation ${name}, starting with ${currentInputs.length} inputs...`);
    
    // Step 1: Apply transformation to each input (can produce multiple outputs per input)
    const allOutputs: (TransformationOutput & { sourceSha256Values: string[] })[] = [];
    
    for (const input of currentInputs) {
      const outputs = transformation(input, options);
      
      // Each output inherits the source sha256 values from its input
      for (const output of outputs) {
        allOutputs.push({
          ...output,
          sourceSha256Values: input.sourceSha256Values,
          queryParams: { ...input.queryParams, ...output.queryParams }, // Merge params
        });
      }
    }
    
    console.log(`  Transformation produced ${allOutputs.length} outputs`);
    
    // Step 2: Deduplicate by content sha256, merging source sha256 lists
    const uniqueOutputs = new Map<string, TransformationInput>();
    
    for (const output of allOutputs) {
      const contentSha256 = computeSha256(output.content);
      
      const existing = uniqueOutputs.get(contentSha256);
      if (existing) {
        // Merge source sha256 values
        const mergedSources = new Set([
          ...existing.sourceSha256Values,
          ...output.sourceSha256Values,
        ]);
        existing.sourceSha256Values = Array.from(mergedSources);
      } else {
        uniqueOutputs.set(contentSha256, {
          content: output.content,
          sourceSha256Values: output.sourceSha256Values,
          queryParams: output.queryParams,
        });
      }
    }
    
    console.log(`  After deduplication: ${uniqueOutputs.size} unique outputs`);
    
    // Step 3: These unique outputs become the inputs for the next transformation
    currentInputs = Array.from(uniqueOutputs.values());
  }

  return currentInputs;
}

export function parseJsonTransformations(transformationsJson: TransformationJson[]): Transformation[] {
  return transformationsJson.map(({ name, options }) => {
    const transformation = Transformations[name];
    if (!transformation) {
      throw new Error(`Unknown transformation: ${name}`);
    }
    if (transformation.validateOptions && !transformation.validateOptions(options || {})) {
      throw new Error(`Invalid options for transformation ${name}`);
    }
    return {
      function: transformation.transform,
      options: options || {},
      name
    }
  });
}

export const Transformations: Record<string, TransformationProvider> = {
  conquerorsUsLayoutTransformation: ConquerorsUsTransformation,
  queryParamTransformation: QueryParamTransformation,
  queryParamFilter: QueryParamFilter,
  trackingImageUrlNormalizer: TrackingImageNormalizer,
}
