# Redirect captures to the same url key

The web archive makes redirects that redirect to the same url key unavailable, and instead they redirect to another capture.

The CDX index still shows the actual status code, but the web archive will always respond with 302 and will not give original capture info. The 302 response is identical to that of captures that are temporarily offline.

Examples of such redirects are:
* Redirect from non-traling slash to trailing slash: http://www.microsoft.com/games/empires -> http://www.microsoft.com/games/empires/
* Redirect from non-www to www: http://microsoft.com/games/empires/ -> http://www.microsoft.com/games/empires/
* Redirect from http to https: http://www.microsoft.com/games/empires/ -> https://www.microsoft.com/games/empires/

## Examples of real 301 captures that are available:

* https://web.archive.org/web/20130630140820id_/http://www.microsoft.com/brasil/games/age2/shared/aoe.jpg
* https://web.archive.org/web/20121020091506id_/http://microsoft.com/games/conquerors/

## Examples of non-www -> www redirects:

* https://web.archive.org/web/20040204121635id_/http://microsoft.com/latam/juegos/age2/
* https://web.archive.org/web/20240509210731id_/http://microsoft.com/games/conquerors/

# Redirect to same url key with no other captures

If there are only redirects to the same url key and no actual captures, the wayback machine will return 404.

## Examples of redirect with no captures:

* https://web.archive.org/web/19990117080047id_/http://office.microsoft.com:80/games/empires
* https://web.archive.org/web/20121028111925id_/http://www.microsoft.com/uk/games/images/age_homepage_02_01.jpg

## Solution

We try getting redirect urls a few times and if none of the attempts succeed at getting an original capture, we assume that the actual capture is unavailable.

To increase performance, a list of urls is used where such urls are most likely self redirects and they will not be retried.
