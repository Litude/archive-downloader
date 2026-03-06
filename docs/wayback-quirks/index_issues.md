# Temporarily unavailable captures

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

## Solution
Keep polling for content until success. However for 301/302 captures, this temporarily offline response is identical to that of same url key redirects. Thus for these status codes special handling is needed. We can't keep trying indefinitely since the original capture might never be returned.

# Captures missing from index

Captures might be missing from one index build and will only become available once the CDX index for the domain is rebuilt. A rebuild has occured when the numPages value has increased. This happens rarely, e.g. for microsoft.com it has been observed circa every 6 months.

## Solution

Need an --incremental parameter that scans the existing captures and only downloads such captures that did not exist in the previous index.
