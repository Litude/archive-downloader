export interface DownloaderError extends Error {
  errorType?: string;
}

export function toDownloaderError(error: unknown): DownloaderError {
  if (error instanceof Error) {
    return error as DownloaderError;
  } else {
    return new Error(String(error)) as DownloaderError;
  }
}
