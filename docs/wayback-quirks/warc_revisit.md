# warc/revisit mimetype

warc/revisit captures indicate that the wayback crawler deduplicated the actual content (but not headers). The CDX archive returns warc/revisit as the mimetype and does not return the original status code either.

## Example urls:
// warc/revisit examples at:
// http://radgametools.com/down/bink/radtools.exe
// http://www.microsoft.com/taiwan/products/Game/AOE/empirestips/images/y08_small.jpg

## Solution
These can be resolved by the wayback CDX api itself by adding the parameter ```resolveRevisits: 'true'```. When added, they will appear as any other capture.


...OR NOT
Error: Snapshot for http://www.microsoft.com/library/images/gifs/homepage/1ptrans.gif at 20090418225140 is a warc/revisit snapshot. These should be resolved by the API parameter, something is wrong!.

Possible reasons:
- Actual capture is temporarily offline?
- So many captures that wayback is unable to resolve them all?
- Corrupt warc records...?
