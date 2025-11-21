export interface DownloadedFile {
  content: Buffer;
  url: string;
  timestamp: string;
  headers: Record<string, any>;
  metadata?: Record<string, any>;
  corrupt: boolean;
  statusCode: string;
}