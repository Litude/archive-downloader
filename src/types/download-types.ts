import { RawHeader } from "../utils/raw-header-parser";

export interface DownloadedFile {
  content: Buffer;
  url: string;
  timestamp: string;
  headers: Record<string, any>;
  rawHeaders: RawHeader[];
  metadata?: Record<string, any>;
  classification?: "corrupt" | "unavailable";
  statusCode: number;
}
