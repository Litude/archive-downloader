import zlib from "zlib";
import { fetchRawRangeBytes } from "./fetch-range-bytes.js";
import { extractGzipMembers } from "./gzip-members.js";
import { parseWarcFile } from "./warc.js";
import { getHeaderValue } from "../headers/headers.js";
import { ArchiveRecord } from "../types/capture-types.js";

// This needs to be quite large, particularily for Wpull which does not necessarily even
// store the request and response adjacent to each other, but can have other records in between...
// (It probably stored the requests as it made them, and then stored the responses as it received them and inited several concurrent requests...)
const ADJACENT_PADDING = 512000; // 500kb (total of 1mb extra download)

export function isRelatedRecord(
  record: Buffer,
  {
    targetUri,
    requestRecordId,
    requestConcurrentToRecordId,
    requestRefersToRecordId,
    responseRecordId,
    responseConcurrentToRecordId,
    responseRefersToRecordId,
  }: {
    targetUri: string | undefined;
    requestRecordId?: string | undefined;
    requestConcurrentToRecordId?: string | undefined;
    requestRefersToRecordId?: string | undefined;
    responseRecordId?: string | undefined;
    responseConcurrentToRecordId?: string | undefined;
    responseRefersToRecordId?: string | undefined;
  },
) {
  try {
    // It is possible that there might be something else than WARC records, skip these
    if (record.subarray(0, 6).toString() !== "WARC/1") {
      return false;
    }
    const parsed = parseWarcFile(record);
    const recordId = getHeaderValue(parsed.metadata, "WARC-Record-ID");
    const concurrentTo = getHeaderValue(parsed.metadata, "WARC-Concurrent-To");
    const refersTo = getHeaderValue(parsed.metadata, "WARC-Refers-To");
    const potentialRecordIds = [
      responseRecordId,
      responseConcurrentToRecordId,
      responseRefersToRecordId,
      requestRecordId,
      requestConcurrentToRecordId,
      requestRefersToRecordId,
    ].filter((id): id is string => !!id);
    const isRelated =
      (recordId && potentialRecordIds.includes(recordId)) ||
      (concurrentTo && potentialRecordIds.includes(concurrentTo)) ||
      (refersTo && potentialRecordIds.includes(refersTo));
    if (!isRelated) {
      const recordTargetUri = getHeaderValue(parsed.metadata, "WARC-Target-URI");
      if (targetUri === recordTargetUri) {
        console.warn(
          `${targetUri}: Record with WARC-Record-ID ${recordId}, WARC-Concurrent-To ${concurrentTo}, and WARC-Refers-To ${refersTo} does not match even though URL matches`,
        );
      }
    }
    return isRelated;
  } catch (error) {
    console.warn(
      `Error parsing WARC record to determine if it's related to main record, treating as unrelated: ${error}`,
    );
    return false;
  }
}

function archiveRecordWithFixedType(record: ArchiveRecord): ArchiveRecord {
  let type: ArchiveRecord["type"];
  const contents = parseWarcFile(record.content);
  const warcType = getHeaderValue(contents.metadata, "WARC-Type");
  switch (warcType) {
    case "warcinfo":
      type = "warc-info";
      break;
    case "request":
      type = "warc-request";
      break;
    case "response":
    case "revisit":
      type = "warc";
      break;
    default:
      type = "warc-unknown";
  }
  return { type, content: record.content };
}

export async function fetchWarcRecordWithAdjacentRecords(
  url: string,
  offset: number,
  length: number,
  fetchOptions: { timeout: number; initialBackoff: number; maxBackoff: number },
): Promise<{
  mainContent: Buffer;
  adjacentPrepended: ArchiveRecord[];
  adjacentTailing: ArchiveRecord[];
}> {
  const wideOffset = Math.max(0, offset - ADJACENT_PADDING);
  const headSize = offset - wideOffset;
  const wideLength = headSize + length + ADJACENT_PADDING;

  const rawBytes = await fetchRawRangeBytes(url, wideOffset, wideLength, fetchOptions);

  const headBytes = rawBytes.subarray(0, headSize);
  const responseBytes = rawBytes.subarray(headSize, headSize + length);
  const tailBytes = rawBytes.subarray(headSize + length);

  const mainContent = zlib.gunzipSync(responseBytes);

  const parsedContentMetadata = parseWarcFile(mainContent).metadata;
  const responseRecordId = getHeaderValue(parsedContentMetadata, "WARC-Record-ID");
  const responseConcurrentToRecordId = getHeaderValue(parsedContentMetadata, "WARC-Concurrent-To");
  const responseRefersToRecordId = getHeaderValue(parsedContentMetadata, "WARC-Refers-To");
  const targetUri = getHeaderValue(parsedContentMetadata, "WARC-Target-URI");

  const relatedRecordOptions = {
    targetUri,
    responseRecordId,
    responseConcurrentToRecordId,
    responseRefersToRecordId,
  };

  const adjacentPrepended = extractGzipMembers(headBytes)
    .map((c) => ({ type: "warc-unknown" as const, content: c }))
    .filter((record) => isRelatedRecord(record.content, relatedRecordOptions))
    .map(archiveRecordWithFixedType);

  const adjacentTailing = extractGzipMembers(tailBytes)
    .map((c) => ({ type: "warc-unknown" as const, content: c }))
    .filter((record) => isRelatedRecord(record.content, relatedRecordOptions))
    .map(archiveRecordWithFixedType);

  return { mainContent, adjacentPrepended, adjacentTailing };
}
