import { RawHeader } from "../headers/raw-header-parser.js";

function parseTagContent(content: string, tagName: string): string | undefined {
  return content.match(new RegExp(`<${tagName}.*?>(.*)</${tagName}>`))?.[1];
}

function addTagDataIfExists(content: string, headers: RawHeader[], tagName: string) {
  const tagContent = parseTagContent(content, tagName);
  if (tagContent) {
    const outputName = tagName.split(":").at(-1) || tagName;
    headers.push([outputName, tagContent]);
  }
}

export function parseArcHeader(buffer: Buffer) {
  const content = buffer.toString("latin1");
  const metadataStart = content.indexOf("<arcmetadata");
  const metadataEnd = content.indexOf("</arcmetadata>");

  const result: RawHeader[] = [];

  if (metadataStart !== -1 && metadataEnd !== -1) {
    addTagDataIfExists(content, result, "arc:software");
    addTagDataIfExists(content, result, "arc:hostname");
    addTagDataIfExists(content, result, "arc:ip");
    addTagDataIfExists(content, result, "dcterms:isPartOf");
    addTagDataIfExists(content, result, "dc:description");
    addTagDataIfExists(content, result, "ns0:date");
    addTagDataIfExists(content, result, "arc:operator");
    addTagDataIfExists(content, result, "arc:http-header-user-agent");
    addTagDataIfExists(content, result, "arc:http-header-from");
    addTagDataIfExists(content, result, "arc:robots");
    addTagDataIfExists(content, result, "dc:format");
    addTagDataIfExists(content, result, "dcterms:conformsTo");
  }
  return result;
}
