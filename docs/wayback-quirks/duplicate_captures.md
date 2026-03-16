# Duplicate captures with the same timestamp

If two or more captures have the same URL key and the same timestamp, only one of them can actually be retrieved from the web archive even though the CDX index will list all captures.

It would seem that the web archive almost always returns the capture that is the LAST capture listed with the timestamp in the CDX index.
However, for https://web.archive.org/web/20011023015508id_/http://www.microsoft.com:80/games/aoeexpansion/img/nav_3_1.GIF there are captures with status codes 200 and 404 and 200 is returned? So maybe it prefers a 200 response? 


20071023202734 for http://microsoft.com:80/latam/juegos/age/  has 301, 403 and returns 403??? So maybe prefer 200 but else pick last?

// Possible that the CDX order and wayback order does not match?

// Seems that what capture is resolved is completely random...?
Found 2 snapshots with same timestamp 20000912032726 for http://eu.microsoft.com:80/germany/library/images/homepage/1ptrans.gif (status codes 404, 200). Attempting to resolve by fetching headers...
Found 2 snapshots with same timestamp 20000912032726 for http://eu.microsoft.com:80/germany/library/images/homepage/1ptrans.gif but couldn't find a matching status code when fetching headers (got 404, expected 200).


multiple 301 captures resolve to 404...
Fetching CDX index for http://www.microsoft.com/uk/games/images/left/bar_icon_on.gif (attempt 1)...
Found 2 snapshots with same timestamp 20130314132001 for http://www.microsoft.com/uk/games/images/left/bar_icon_on.gif (status codes 301, 301). Attempting to resolve by fetching headers...



capture has 301 and 200 status code, but 302 is returned??? is the capture temporarily offline?
https://web.archive.org/web/20110816232417id_/http://www.microsoft.com:80/games/product_registration/age2/

Code for reference:
* https://github.com/internetarchive/wayback/blob/master/wayback-core/src/main/java/org/archive/wayback/resourceindex/filters/DuplicateTimestampFilter.java

## Example URLs

* https://web.archive.org/web/20090118230235id_/http://www.microsoft.com:80/brasil/games/age2/
* https://web.archive.org/web/20090218234316id_/http://www.microsoft.com:80/brasil/games/age2

## Solution
We always assume that the capture that can be retrieved is the last capture for the timestamp.
TODO: Not strictly so?
