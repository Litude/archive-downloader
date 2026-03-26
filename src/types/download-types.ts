import { RawHeader } from "../utils/raw-header-parser.js";

export interface DownloadedFile {
  content: Buffer;
  url: string;
  timestamp: string;
  headers: Record<string, any>;
  rawHeaders: RawHeader[];
  metadata?: {
    downloadErrorDetails?: {
      reason: string;
      downloadedSize: number;
      actualSize: number | null;
    }
  };
  classification?: "corrupt" | "unavailable";
  statusCode: number;
}
