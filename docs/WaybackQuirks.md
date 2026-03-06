

## Captures temporarily offline

Captures might be temporarily offline. This is very intermittent and trying to get the capture by polling for circa 5 minutes usually resolves the capture. When a capture is offline, a redirect response like the following is received:

```
> curl -I https://web.archive.org/web/20010910030801id_/http://microsoft.com:80/spain/juegos/aoeII/images/capturas_s/ss_s_19.gif

HTTP/2 302
server: nginx
date: Tue, 24 Feb 2026 16:58:50 GMT
content-type: text/plain; charset=utf-8
content-length: 0
x-archive-redirect-reason: found capture at 20020504221610
location: https://web.archive.org/web/20020504221610id_/http://microsoft.com/spain/juegos/aoeII/images/capturas_s/ss_s_19.gif
server-timing: captures_list;dur=0.791476, exclusion.robots;dur=0.077748, exclusion.robots.policy;dur=0.062637, esindex;dur=0.012578, cdx.remote;dur=21.175776, LoadShardBlock;dur=416.012683, PetaboxLoader3.datanode;dur=30337.959584, PetaboxLoader3.resolve;dur=205.431269, load_resource;dur=30263.381974
x-app-server: wwwb-app219-dc8
x-ts: 302
x-tr: 30734
server-timing: TR;dur=0,Tw;dur=0,Tc;dur=1
set-cookie: wb-p-SERVER=wwwb-app219; path=/
x-location: All
x-as: 719
x-rl: 0
x-na: 0
x-page-cache: MISS
server-timing: MISS
x-nid: Elisa Oyj
referrer-policy: no-referrer-when-downgrade
permissions-policy: interest-cohort=()
```

Solution: Keep polling for content until success

Problems: When resolving duplicate captures, this can still be a problem. What if there are 302 and 400 status code captures and actually 400 is resolved but due to being temporarily offline a 302 status code is returned???

Actual 302 captures might return additional data fields e.g. x-archive-src, example:
```
> curl -I https://web.archive.org/web/20080224035142id_/http://www.microsoft.com:80/japan/games/empires/default.asp

HTTP/2 302
server: nginx
date: Tue, 24 Feb 2026 16:32:42 GMT
content-type: text/html; charset=utf-8
content-length: 203
x-archive-orig-cache-control: private
location: /web/20080224035142id_/http://www.microsoft.com/japan/library/404/error.aspx?url=/japan/games/empires/default.asp
x-archive-orig-server: Microsoft-IIS/7.0
x-archive-orig-x-aspnet-version: 2.0.50727
x-archive-orig-p3p: CP="ALL IND DSP COR ADM CONo CUR CUSo IVAo IVDo PSA PSD TAI TELo OUR SAMo CNT COM INT NAV ONL PHY PRE PUR UNI"
x-archive-orig-x-powered-by: ASP.NET
x-archive-orig-date: Sun, 24 Feb 2008 03:51:43 GMT
x-archive-orig-connection: keep-alive
x-archive-orig-content-length: 203
cache-control: max-age=1800
memento-datetime: Sun, 24 Feb 2008 03:51:42 GMT
link: <http://www.microsoft.com:80/japan/games/empires/default.asp>; rel="original", <https://web.archive.org/web/timemap/link/http://www.microsoft.com:80/japan/games/empires/default.asp>; rel="timemap"; type="application/link-format", <https://web.archive.org/web/http://www.microsoft.com:80/japan/games/empires/default.asp>; rel="timegate"
content-security-policy: default-src 'self' 'unsafe-eval' 'unsafe-inline' data: blob: archive.org web.archive.org web-static.archive.org wayback-api.archive.org athena.archive.org analytics.archive.org pragma.archivelab.org wwwb-events.archive.org
x-archive-src: 52_2_20080224025456_crawl108-c/52_2_20080224034827_crawl106.arc.gz
server-timing: captures_list;dur=0.763949, exclusion.robots;dur=0.080841, exclusion.robots.policy;dur=0.067531, esindex;dur=0.010056, cdx.remote;dur=48.288982, LoadShardBlock;dur=387.224000, PetaboxLoader3.resolve;dur=220.455763, PetaboxLoader3.datanode;dur=334.900873, load_resource;dur=343.550435
x-app-server: wwwb-app244-dc8
x-ts: 302
x-tr: 816
server-timing: TR;dur=0,Tw;dur=0,Tc;dur=4
set-cookie: wb-p-SERVER=wwwb-app244; path=/
x-location: All
x-as: 719
x-rl: 0
x-na: 0
x-page-cache: MISS
server-timing: MISS
x-nid: XXX
referrer-policy: no-referrer-when-downgrade
permissions-policy: interest-cohort=()
```

However, they might also look identical to captures that are temporarily offline, e.g.:

```
curl -I https://web.archive.org/web/19991105175521id_/http://www.microsoft.com/italy/games/empires

HTTP/2 302
server: nginx
date: Tue, 24 Feb 2026 16:34:57 GMT
content-type: text/plain; charset=utf-8
content-length: 0
x-archive-redirect-reason: found capture at 19991013181137
location: https://web.archive.org/web/19991013181137id_/http://www.microsoft.com/italy/games/empires/
server-timing: captures_list;dur=0.567282, exclusion.robots;dur=0.065858, exclusion.robots.policy;dur=0.056611, esindex;dur=0.009284, cdx.remote;dur=58.192818, LoadShardBlock;dur=701.052850, PetaboxLoader3.resolve;dur=312.224985, PetaboxLoader3.datanode;dur=749.917402, load_resource;dur=386.512605
x-app-server: wwwb-app242-dc8
x-ts: 302
x-tr: 1170
server-timing: TR;dur=0,Tw;dur=0,Tc;dur=1
set-cookie: wb-p-SERVER=wwwb-app242; path=/
x-location: All
x-as: 719
x-rl: 0
x-na: 0
x-page-cache: MISS
server-timing: MISS
x-nid: XXX
referrer-policy: no-referrer-when-downgrade
permissions-policy: interest-cohort=()
```

So basically there is no way to differentiate between a temporarily offline 302 response and a legit 302 capture...

Would need to do something like best effort, e.g. attempt 302 for 10 times with exponential backoff and accept it as a true 302 if none of the responses include x-archive-src?

## 302 reponse code returning 404

If there is only a 302 capture for some url (and the capture had no content), it will actually return 404.

## Captures missing from index

Captures might be missing from one index build and will only become available once the CDX index for the domain is rebuilt. A rebuild has occured when the numPages value has increased. This happens rarely, e.g. for microsoft.com it has been observed circa every 6 months.

Solution: Need an --incremental parameter that scans the existing captures and only downloads such captures that did not exist in the previous index.

## Partial captures

TODO:
