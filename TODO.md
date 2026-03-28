- Add some error context to handlers and these will be logged to the final
  capture data?

- Add lam/mex alt image urls

- For file level capture metadata need to add info about (these will be
  approximate since getting the exact amounts would require additional queries):
  - Filtered capture amount due to duplicate captures
  - Filtered capture amount due to non trailing slash to trailing slash redirect

  url metadata

captures
validCaptures
invalidCaptures
sources: {
   wayback: [capturecount]
   commoncrawl: [capturecount]
}

filteredEntries: {
   wayback: {
      limitedCaptureRamge: [captureAmount]
      duplicateTimestamp: [captureAmount]
      nonTrailingSlash: [captureCount]
      // timestamp is exlucded
   }
  commoncrawl: {
    ...same stuff
  }
}
executions: [
  {
    "timestamp": isostring,
    "type": full | incremental
    "capturecounts": {
      total: number
      valid: number
      invalid: number
    }
  }
]

Skip these ideas for now:

- Add info if file is from main url or mirror?
  - easy to do for some sites, but what if the main mirror always redirected to
    some random mirror such as for downloads (what does the concept of a mirror
    then mean?)

- storing "effective" capture date in addition to capture date? Timestamp
  approximation for e.g. frozen mirrors that should correspond when it could
  have been captured from the main mirror. Probably would require way too much
  manual effort?
