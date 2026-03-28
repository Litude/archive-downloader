export const commonCrawlCleanupData: Record<
  string,
  {
    metadataHeaderPrefixes?: string[];
    contentLengthIncludesTrailingNewline?: boolean;
    extraBlankLineAfterHeaders?: boolean;
  }
> = {
  "CC-MAIN-2008-2009": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
  },
  "CC-MAIN-2009-2010": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
  },
  "CC-MAIN-2012": {
    metadataHeaderPrefixes: ["x_commoncrawl_", "x-commoncrawl-"],
    contentLengthIncludesTrailingNewline: true,
  },
  "CC-MAIN-2018-34": {
    extraBlankLineAfterHeaders: true,
  },
};
