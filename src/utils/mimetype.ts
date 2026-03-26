export function extractMimeTypeFromContentType(
  contentTypeHeader: string | undefined,
): string | undefined {
  if (!contentTypeHeader) {
    return undefined;
  }
  const [mimeType] = contentTypeHeader.split(";").map((part) => part.trim());
  return mimeType || undefined;
}
