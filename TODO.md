- Use CDX precaching for wayback
- Add flag to download all files, not just fetch headers. Could have 3 modes:
  * Quick: Only fetch unique digests
  * Medium: Fetch unique digests + all missing headers
  * Full: Fetch all files


- MAYBE: Don't discard all duplicates in wayback, instead store recognizable unique entries (by status code) as unavailable entries? But then should probably also store the non-slash -> slash redirects?
   * E.g empires default has 1102 valid captures with 50 invalid but around 120 slash redirects --> percentage of "invalid" captures increases by a lot
   * Actually the resolveDuplicates function probably needs 3 operating modes:
     - Current operating mode, where if url ends with a slash but capture does not, capture is only kept if it is valid
       (This is needed only because some common crawl urls are broken and lack the trailing slash...)
     - Operating mode which is strict, i.e. route ending with slash gives only slash, route without slash does not give slash urls
     - Either operating mode, both are kept, no filtering based on url

   How the resolver should work:
     - We must resolve which capture is actually returned first (before doing any filtering)
     - After resolving, we can create a merged capture of each unique status code for the url
       - What if the URL entry differs for same status captures?
         * If the normalized path name matches, we can live with it and just pick one
         * If the normalized path names don't match, do we need to drop all these captures?
     - We classify the rest of the entires that are not resolved as unavailable

     - After this, we can perform the slash/non-slash filtering

    How should the filtering work:
     - 

   What do we want as output from the duplicate filtering:
    - Unique resolvable entries
    - The number of duplicates that were filtered that would not have been filtered by slash mode filter
    - The number of duplicates that were filtered that would have matched the slash mode filter

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
