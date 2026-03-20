# WARC Files
If a page/document is truncated it's flagged in the WARC record header (since Nov 2019):
WARC-Truncated: length
There are other reasons for the truncation: time (timeout), (network) disconnect.
The truncation is also marked in the indexes.

The original "Content-Length" HTTP header is rewritten to
X-Crawler-Content-Length: 2581792
and a new one with the truncated length is added
Content-Length: 1048576
to avoid that WARC parsers choke on the wrong payload length. 


Due to an issue with our crawler, not all truncations were indicated correctly. A workaround to detect length truncation is to be suspicious if the length of the content is exactly 1048576 bytes. Truncations for time or network do not have such a workaround. In the WARC files this indicator is called "WARC-Truncated".

The "length" in the CDX index is the length of the gzip-compressed WARC record. The name in the columnar index warc_record_length reflects this better.

It is also worth noting that PDFs end with %%EOF perhaps followed by a linefeed.

# ARC Files
Content-Length seems to be original non-truncated length
has header:

x-commoncrawl-ContentTruncated:TruncatedInDownload