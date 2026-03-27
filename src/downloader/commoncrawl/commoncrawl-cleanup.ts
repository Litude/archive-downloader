export const commonCrawlCleanupData: Record<
  string,
  {
    metadataHeaderPrefix: string;
    contentLengthIncludesTrailingNewline?: boolean;
  }
> = {
  "CC-MAIN-2008-2009": {
    metadataHeaderPrefix: "x_commoncrawl_",
  },
  "CC-MAIN-2009-2010": {
    metadataHeaderPrefix: "x_commoncrawl_",
  },
  "CC-MAIN-2012": {
    metadataHeaderPrefix: "x-commoncrawl-",
    contentLengthIncludesTrailingNewline: true,
  },
};
