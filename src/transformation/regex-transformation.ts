export interface RegexTransformationOptions {
  pattern: string;
  replacement: string;
  flags?: string;
  transforms?: string[];
}

type Transform = (captureGroups: string[]) => string[];

const TRANSFORMS: Record<string, Transform> = {
    captureToLowerCase: (groups) => groups.map(g => g.toLowerCase()),
    captureToUpperCase: (groups) => groups.map(g => g.toUpperCase()),
    // Add more transforms as needed
};

function applyTransforms(captureGroups: string[], transformNames?: string[]): string[] {
    if (!transformNames || !transformNames.length) return captureGroups;
    
    let result = captureGroups;
    for (const transformName of transformNames) {
        const transform = TRANSFORMS[transformName];
        if (transform) {
            result = transform(result);
        }
    }
    return result;
}

function applyNormalizationRules(content: Buffer, normalizations: RegexTransformationOptions[]): Buffer | null {
    let htmlContent = content.toString("latin1");
    let contentChanged = false;

    for (const norm of normalizations) {
        const regex = new RegExp(norm.pattern, norm.flags || "g");
        
        const newHtmlContent = htmlContent.replace(regex, (...args) => {
            // args = [fullMatch, capture1, capture2, ..., offset, fullString, groups]
            const fullMatch = args[0];
            const offset = args[args.length - 2];
            const captureGroups = args.slice(1, -2); // Extract all capture groups
            //console.log(`Applying normalization at offset ${offset}: ${fullMatch} -> ${norm.replacement}`);
            //console.log(`  Capture groups: ${captureGroups.join(", ")}`);
            
            // Apply transforms to capture groups
            const transformedGroups = applyTransforms(captureGroups, norm.transforms);
            
            // Replace $1, $2, etc. in replacement string
            let result = norm.replacement;
            transformedGroups.forEach((group, index) => {
                result = result.replace(new RegExp(`\\$${index + 1}`, 'g'), group);
            });
            
            return result;
        });

        if (newHtmlContent !== htmlContent) {
            contentChanged = true;
            htmlContent = newHtmlContent;
        }
    }
    return contentChanged ? Buffer.from(htmlContent, "latin1") : null;
}

export const RegexNormalizer = {
    normalize: applyNormalizationRules,
} as const;
