export interface CdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  status: string;
  digest?: string;
  mimetype: string;
  filename?: string;
  length?: number;
  offset?: number;
  source: string;
  isWarcRevisit?: boolean;
  headers?: Record<string, any>;
}
