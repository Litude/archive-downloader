import { RawHeader } from "../utils/raw-header-parser.js";

export interface CdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  status?: number;
  digest?: string;
  mimetype: string;
  filename?: string;
  offset?: number;
  length?: number;
}

export interface ExtendedCdxEntry extends CdxEntry {
  /** e.g. wayback, commoncrawl */
  source: string;
  /** For entries that were originally warc/revisit and are resolved, this contains the original entry with the warc/revisit content type */
  revisitEntry?: CdxEntry;
  // /** Things stored by the processing pipeline not part of the actual cdx entry */
  metadata?: {
    headers: Record<string, string>;
    rawHeaders: RawHeader[];
  };
}
