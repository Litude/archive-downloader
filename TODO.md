* How to handle cases where the same capture exists in both wayback and commoncrawl:
1. Assume all common crawl captures also exist in wayback (not true and could cause duplicate issues?)
2. Store info about multiple sources for the same capture (?), might need to store 2 separate cdx index entries?
3. Add additional sources where source name and cdx entry is kept


* Figure out what to do about commoncrawl captures that have the same digest as other captures but they are actually corrupt when returned by Wayback (but commoncrawl has valid data?).
  - Just exclude them by collection id
  - Add an option to just fetch all files?

* Add some error context to handlers and these will be logged to the final capture data?

* Add info if file is from main url or mirror?
  - easy to do for some sites, but what if the main mirror always redirected to some random mirror such as for downloads (what does the concept of a mirror then mean?)

* storing "effective" capture date in addition to capture date? Timestamp approximation for e.g. frozen mirrors that should correspond when it could have been captured from the main mirror.

* Add collection info to summary files
* Figure out how to store headers...
    * Group headers with x-archive-orig into their own subsection without any other stuff?
    * Headers that are reconstructed separately (location, content-type etc)?
    * What about common-crawl crawling data? Extract it to metadata instead?


* For file level capture metadata need to add info about (these will be approximate since getting the exact amounts would require additional queries):
   - Filtered capture amount due to duplicate captures
   - Filtered capture amount due to non trailing slash to trailing slash redirect

url
timestamp
timestampPrecise
status
modificationTime
modificationTimePrecise
headers: {
   original: all x-archive-orig headers (except for common crawl stuff)
   reconstructed: all address headers, content-type and content-length if they were missing frong the x-archive-orig headers
}
captureData: {
   sha256: string, // this should always be the raw sha256, not output sha256
   actualDigest: string, // manually calculated digest
   classification: string,
   classificationDetails: { // only for truncated file downloads
    "downloadedSize": "1234",
    "actualSize": "5678"
   }
   hostIp?: string;
   // warc/arc available?
   cdxEntry: {
      urlkey: string // from cdx index
      mimetype: string // from cdx index
      status: string //
      digest: string // cdx index digest, which seems to be slighlty off for some files...?
      length: number | null, // size from cdx index?
      offset: number | null, //
      filename: string | null,
   }

   wayback: {
      item: {
        id: string;
        name: string;
        description: string;
        collections: string[],
      }
      mementoDatetime: string?
   },
   commonCrawl: {
      // all common crawl headers?
   }
}


{
  "url": "http://example.com/page.htm",
  "timestamp": "2001-06-15T12:00:00Z",
  "timestampPrecise": "2001-06-15T12:00:00.123000000Z",
  "status": 200,
  "modificationTime": "2001-05-20T10:30:00Z",
  "modificationTimePrecise": "2001-05-20T10:30:00.000000100Z",

  "headers": {
    "original": {
      "last-modified": "...", "date": "...", "etag": "...",
      "server": "Microsoft-IIS/5.0", "content-type": "text/html"
    },
    "reconstructed": {
      "location": "/redirected/path", "content-type": "text/html"
    }
  },

  "captureData": {
    "sha256": "abc123...",
    "actualDigest": "sha1:XYZ...",
    "classification": "ok",
    "classificationDetails": { "downloadedSize": "1234", "actualSize": "5678" },
    "wayback": {
      "digest": "XYZ...", "length": 5678, "mimetype": "text/html",
      "collections": ["web"], "filename": "crawl-data/.../warc.gz",
      "mementoDatetime": "...", "isWarcRevisit": true
    },
    "commonCrawl": { "fetchTimestamp": "992607600123" }
  }
}


fetch cdx index first without resolving revisits, only if revisits occur do we fetch the index again to resolve them

must be matched by index, precheck that lengths still match
