
export interface Context {
  fileContext: FileContext;
  settings: {
    includeInvalid?: boolean
    peekAllFiles?: boolean
    writeHeaders?: boolean
    skipOn302?: boolean;
    fetchMetadata?: boolean;
    fetchOriginalRecord?: boolean;
  }
}

// dummy for now...
export interface FileContext {
    errors?: any[]; // TODO: Define a proper error type
}
