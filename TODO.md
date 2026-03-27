TODO CommmonCrawl:

- Handle warc/revisit
- Capture errata handling (fixing capture_ts and url), url fixing needed for
  some non-common crawl stuff as well (http://\ urls)

output filenames for incremental handling:

1. capture data stored for all captures --> can be found with index from .csv
2. raw file stored only if transformed and unique, if stored should use same
   name prefix as capture data (it should ignore last modified) -- deduplicated,
   so finding the raw capture means looking up the first entry (earliest capture
   date) with the same sha256 value
3. actual output file is deduplicated but has special modification time
   handling: -- for each unique modification date, duplicates are saved -- if a
   capture is missing a modificaiton date but some capture with the same sha256
   value has a modification date, no output for this one --- so two different
   lookup cases:
   1. has modification time -> lookup based on modification time
   2. no modification time -> lookup earliest capture date with same sha256
      ...but what if there are two outputs with the same name? do we need an
      output data index column in the csv??? ...usually a duplicate timestamp
      output is probably an error (data is supposed to get normalized to avoid
      this), so the downloader could just throw an error in these cases? however
      it is possible that some servers return e.g. randomized data on the same
      timestamp? so the best choice is to add another index field to the csv

- Add some error context to handlers and these will be logged to the final
  capture data?

- For file level capture metadata need to add info about (these will be
  approximate since getting the exact amounts would require additional queries):
  - Filtered capture amount due to duplicate captures
  - Filtered capture amount due to non trailing slash to trailing slash redirect

Skip these ideas for now:

- Add info if file is from main url or mirror?
  - easy to do for some sites, but what if the main mirror always redirected to
    some random mirror such as for downloads (what does the concept of a mirror
    then mean?)

- storing "effective" capture date in addition to capture date? Timestamp
  approximation for e.g. frozen mirrors that should correspond when it could
  have been captured from the main mirror. Probably would require way too much
  manual effort?
