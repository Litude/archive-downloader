export interface CdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  status: string;
  digest?: string;
  mimetype: string;
  filename?: string;
  offset?: number;
  length?: number;
  source: string;
  /** For entries that were originally warc/revisit and are resolved, this contains the original entry with warc/revisit content type */
  revisitEntry?: CdxEntry;
  isWarcRevisit?: boolean;
  headers?: Record<string, any>;
}
