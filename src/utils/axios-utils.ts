import { AxiosRequestConfig, AxiosResponse } from "axios";

// maxRedirects: 0 is not working as expected, it will crash the whole process if the capture is corrupt
// So instead we add a beforeRedirect handler that throws an error, which we can catch and handle gracefully in the downloader
export const preventAxiosRedirects: AxiosRequestConfig = {
  beforeRedirect: () => {
    throw new Error("Unexpected redirect...");
  },
};

export function cleanupAxiosResponseHeaders(
  headers: AxiosResponse["headers"],
): Record<string, string> {
  const cleanedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      cleanedHeaders[key] = value.join(",");
    } else {
      cleanedHeaders[key] = value;
    }
  }
  return cleanedHeaders;
}
