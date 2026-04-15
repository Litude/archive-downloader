import { CaptureEntry } from "../types/capture-types.js";
import { deriveRefererFromMicrosoftTrackingImage } from "./header-derivation/microsoft-tracking-image.js";

export function deriveHeaders(captureEntry: CaptureEntry) {
  const derivedHeaders = deriveRefererFromMicrosoftTrackingImage(captureEntry);
  if (derivedHeaders) {
    captureEntry.derivedHeaders = derivedHeaders;
  }
}
