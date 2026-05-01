import { AxiosResponse } from "axios";

export function isWaybackCaptureResponse(response: AxiosResponse): boolean {
  return !!response.headers["x-archive-src"];
}
