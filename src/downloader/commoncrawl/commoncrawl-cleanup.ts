export const commonCrawlCleanupData: Record<
  string,
  {
    metadataHeaderPrefixes?: string[];
    contentLengthIncludesTrailingNewline?: boolean;
    extraBlankLineAfterHeaders?: boolean;
    timestampIsLocalTime?: boolean;
    alreadyDechunked?: boolean;
    implicitRedirects?: boolean;
  }
> = {
  "CC-MAIN-2008-2009": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
    timestampIsLocalTime: true,
    implicitRedirects: true,
    alreadyDechunked: true,
  },
  "CC-MAIN-2009-2010": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
    timestampIsLocalTime: true,
    implicitRedirects: true,
    alreadyDechunked: true,
  },
  "CC-MAIN-2012": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
    contentLengthIncludesTrailingNewline: true,
    alreadyDechunked: true,
  },
  "CC-MAIN-2018-34": {
    extraBlankLineAfterHeaders: true,
  },
};
