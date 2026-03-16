* Dl missing aoe registration stuff
* Fix regex handling for lam/mex pages
* Add some error context to handlers and these will be logged to the final capture data?

* Make caoture data source agnostic (so it will say whether it is from e.g. wayback or commoncrawl and use common terms for common fields)

* Since capture timestamps are precise only up to a second and also http header last-modified, remove milliseconds from capture summary
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
   wayback: {
      urlkey: string // from cdx index
      mimetype: string // from cdx index
      digest: string // cdx index digest, which seems to be slighlty off for some files...?
      length: number, // size from cdx index?
      collections: string[],
      filename: wayback filename,
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