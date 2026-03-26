import { AxiosRequestConfig } from "axios";

// maxRedirects: 0 is not working as expected, it will crash the whole process if the capture is corrupt
// So instead we add a beforeRedirect handler that throws an error, which we can catch and handle gracefully in the downloader
export const preventAxiosRedirects: AxiosRequestConfig = { beforeRedirect: () => {
  throw new Error("Unexpected redirect...");
}};
