All common crawl captures served by wayback seem to be corrupt, even though the original capture as retrieved from common crawl seems to be fine.
(It seems common crawl stored gzipped data improperly, the content is unzipped even though the headers indicate it should be zipped --> wayback sends the compressed length of bytes and indicates that it is zipped)

Even worse, they share the same (proper) digest with non-corrupt captures so simply downloading by unique digests either results in the corrupt captures silently getting skipped (if the selected capture is not from common crawl) or causes all captures with the same digest to get corrupt (if the selected capture is from common crawl).

Since this seems to be only limited to common crawl
* Ensure that any common crawl captures are considered unique and are not collapsed by digest
