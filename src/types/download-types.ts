import { RawHeader } from "../headers/raw-header-parser.js";

export interface DownloadedFile {
  content: Buffer;
  url: string;
  timestamp: string;
  responseHeaders: Record<string, string>;
  rawResponseHeaders: RawHeader[];
  metadata?: {
    downloadErrorDetails?: {
      reason: string;
      downloadedSize: number;
      actualSize: number | null;
    };
  };
  classification?: "corrupt" | "unavailable";
  statusCode: number;
}
