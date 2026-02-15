export interface CdxEntry {
  urlkey: string;
  timestamp: string;
  url: string;
  status: string;
  digest: string;
  mimetype: string;
  length: number;
  metadata?: Record<string, string>;
}
