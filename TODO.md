- Use CDX precaching for wayback
- Add flag to download all files, not just fetch headers. Could have 3 modes:
  * Quick: Only fetch unique digests
  * Medium: Fetch unique digests + all missing headers
  * Full: Fetch all files

- Write a total CSV summary of all files which allows e.g. easy lookup of any captures in a specific date range (should probaby always append/clear only previous entries of same url to allow pausing/resuming the dowlonder)

- Prevent double downloading by adding files that reference each other?

Skip these ideas for now:

- Add info if file is from main url or mirror?
  - easy to do for some sites, but what if the main mirror always redirected to
    some random mirror such as for downloads (what does the concept of a mirror
    then mean?)

- storing "effective" capture date in addition to capture date? Timestamp
  approximation for e.g. frozen mirrors that should correspond when it could
  have been captured from the main mirror. Probably would require way too much
  manual effort?
