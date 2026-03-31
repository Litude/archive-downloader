export interface WaybackItemFile {
  name: string; // filename
  source: string; // encountered values: "derivative", "original"
  format: string;
  original?: string; // original filename this is based on if this is a derivative file
  mtime: string; // epoch seconds
  size: string; // bytes as string
  filecount?: string;
  md5: string;
  crc32: string;
  sha1: string;
  private?: string; // "true" if private, else omitted
}

export interface WaybackMetadata {
  identifier: string; // the item id that is part of the url
  contributor?: string; // e.g. "Alexa Internet", "Alexa" (shown on the interface if no creator)
  creator?: string; // e.g. "Internet Archive", "thumper2.php", "Archive Team", "Archive-It" (what is shown as the creator in the wayback interface)
  date?: string; // actually the year of the crawl, not a full date, e.g. "2020"
  description: string; // Long description, might contain HTML tags and newlines
  coverage?: string; // filled by portuguese web archive crawl, description-like text of coverage
  notes?: string; // filled by portuguese web archive crawl,
  firstfiledate?: string; // YYYYMMDDHHMMSS, Seems to be PST/PDT San Fransico local time
  firstfileserial?: string; // number suffix of some crawl archives, this is that of the first one (not necessarily smaller than lastfileserial)
  lastdate?: string; // YYYYMMDDHHMMSS, last date of whole crawl(?) / For some items this is earlier than firstfiledate(???) / Seems to match the last date in the title
  lastfiledate?: string; // YYYYMMDDHHMMSS, last date of this crawl segment(?). Seems to be PST/PDT San Fransico local time
  lastfileserial?: string; // number suffix of some crawl archives, this is that of the last one (not necessarily larger than firstfileserial)
  mediatype: string; // e.g. "web", "collection"
  operator?: string; // email address of operator?
  scandate?: string; // YYYYMMDDHHMMSS, seems to be before firstfiledate, maybe when the scanning/crawling started? Seems to be PST/PDT San Fransico local time
  scanner?: string; // e.g. "Alexa Internet", "crawl455.us.archive.org"
  scanningcenter?: string; // e.g. "San Francisco", "sanfransisco", "redwoodcity"
  sizehint?: string; // number as string, perhaps the total size of all files in the crawl(?)
  sponsor?: string; // e.g. "Alexa Internet", "National Library of Australia", "Internet Archive"
  subject?: string; // e.g. "crawldata"
  title: string; // Title shown in wayback interface
  crawler?: string; // crawling software, e.g. "Heritrix/1.15.5-201101182339"
  crawljob?: string;
  collection?: string[] | string; // if just single item in collection, this is a string instead of array
  publicdate: string; // YYYY-MM-DD HH:MM:SS, perhaps when item added to wayback? but seems to match addeddate in most cases especially for old captures
  uploader: string; // email address of uploader
  addeddate: string; // YYYY-MM-DD HH:MM:SS, for old captures from the 90s this is still a date from around 2012
  imagecount?: string; // number as string, this is called "Pages" in the interface, perhaps number of urls captured?
  numwarcs?: string; // number as string, should match the count of warc.gz files in the files array (but not always filled)
  numarcs?: string; // number as string, should match the count of arc.gz files in the files array (but not always filled)
  boxid?: string;
  backup_location?: string; // seems to be the name of a server?
  "fail-reasons"?: string;
  [key: string]: any; // for any additional fields that may be present
}

export interface WaybackItemDetails {
  created: number; // timestamp in seconds (does not match actual file created date, what is this???)
  d1: string;
  dir: string;
  files: WaybackItemFile[];
  files_count: number;
  item_last_updated: number; // timestamp in seconds
  item_size: number;
  metadata: WaybackMetadata;
  server: string;
  simplelists: {
    solo_manifest: Record<
      string,
      {
        sys_changed_by: {
          source: string;
          task_id: string;
        };
        sys_last_changed: string; // YYYY-MM-DD HH-MM-SS.mmmmmm
      }
    >;
  };
  solo: boolean;
  uniq: number;
  workable_servers: string[];
}

export interface WaybackItemCachedDetails {
  files: Pick<WaybackItemFile, "name" | "private">[];
  metadata: WaybackMetadata;
}
