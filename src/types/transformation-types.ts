export type TransformationInput = {
  content: Buffer;
  sourceSha256Values: string[];
  queryParams: Record<string, string | null>;
};

export type TransformationOutput = {
  content: Buffer;
  queryParams: Record<string, string | null>; // Additional params added by this transformation
};

export interface TransformationProvider {
  name: string;
  transform: (input: TransformationInput, transformationOptions: Record<string, any>) => TransformationOutput[];
  validateOptions?: (options: Record<string, any>) => boolean;
}

export type Transformation = {
  function: (input: TransformationInput, transformationOptions: Record<string, any>) => TransformationOutput[];
  options: Record<string, any>;
};
