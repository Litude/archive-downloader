export interface Context {
  fileContext: FileContext;
  settings: {
    includeInvalid?: boolean;
    peekAllFiles?: boolean;
    writeHeaders?: boolean;
    skipOn302?: number;
    fetchMetadata?: boolean;
    fetchOriginalRecord?: boolean;
  };
}

// dummy for now...
export interface FileContext {
  errors?: any[]; // TODO: Define a proper error type
}
