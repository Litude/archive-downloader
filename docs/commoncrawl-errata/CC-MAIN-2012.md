- When extracting headers, need to filter out any with the "x-commoncrawl-"
  prefix (2012) as they are not original but added by common crawl
- Seems to have proper UTC timestamps by now
- One extra \x0A byte at the end of all payloads
