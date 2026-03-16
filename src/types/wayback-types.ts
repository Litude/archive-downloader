export interface CdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  status: string;
  digest: string;
  mimetype: string;
  filename?: string;
  length?: number;
  collections?: string[];
  metadata?: Record<string, string>;
}
