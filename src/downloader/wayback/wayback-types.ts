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
  ["access-restricted-item"]?: string; // "true" if access restricted, else omitted
  addeddate: string; // YYYY-MM-DD HH:MM:SS UTC. If >2019-12, date when item was made public in wayback, else date when item was created
  boxid?: string; // physical catalog id, e.g. "IA1113259-1" but also exists for crawls <2012 where it is OL#########
  collection?: string[] | string; // if just single item in collection, this is a string instead of array (recursively includes all parent collections)
  contributor?: string; // person or org that provided the media, e.g. "Alexa Internet", "Alexa" (shown on the interface if no creator)
  coverage?: string; // filled by portuguese web archive crawl, description-like text of crawl coverage.
  creator?: string; // person or org that crated the media, e.g. "Internet Archive", "thumper2.php", "Archive Team", "Archive-It" (what is shown as the creator in the wayback interface)
  date?: string; // actually the year of the crawl, not a full date, e.g. "2020", accepted values are also e.g. "2020-05" and "2020-05-20". Free form text, can also contain "c.a. YYYY"
  description: string; // Long description, might contain HTML tags and newlines
  firstfiledate?: string; // YYYYMMDDHHMMSS, Seems to be PST/PDT San Fransico local time. Creation date of earliest file
  identifier: string; // the item id that is part of the url
  imagecount?: string; // number as string, number of urls captured
  lastfiledate?: string; // YYYYMMDDHHMMSS, last date of this crawl segment(?). Seems to be PST/PDT San Fransico local time, does not really match the latest date in the files(?)
  mediatype: string; // e.g. "web", "collection"
  notes?: string; // additional notes, filled by portuguese web archive crawl,
  operator?: string; // email address of person who captured the media or in web items engineer responsible for crawl
  publicdate: string; // YYYY-MM-DD HH:MM:SS UTC when item was created on archive.org
  scandate?: string; // YYYYMMDDHHMMSS, seems to be before firstfiledate, maybe when the scanning/crawling started? Seems to be PST/PDT San Fransico local time. Canonically should be the date of the first WARC item.
  scanner?: string; // e.g. "Alexa Internet", "crawl455.us.archive.org" (crawl machine hostname)
  scanningcenter?: string; // e.g. "San Francisco", "sanfransisco", "redwoodcity". Location where "scanning" (crawling) was done
  source?: string; // for focused crawl items, this is the seed url
  sponsor?: string; // person/org that funded the crawl, e.g. "Alexa Internet", "National Library of Australia", "Internet Archive"
  subject?: string; // e.g. "crawldata" (multiple subjects are separated by ";")
  title: string; // Title shown in wayback interface

  /** Fields that are not officialy documented are below... */
  firstfileserial?: string; // number suffix of some crawl archives, this is that of the first one (not necessarily smaller than lastfileserial)
  lastdate?: string; // YYYYMMDDHHMMSS, last date of whole crawl(?) / For some items this is earlier than firstfiledate(???) / Seems to match the last date in the title
  lastfileserial?: string; // number suffix of some crawl archives, this is that of the last one (not necessarily larger than firstfileserial)
  sizehint?: string; // number as string, perhaps the total size of all files in the crawl(?)
  crawler?: string; // crawling software, e.g. "Heritrix/1.15.5-201101182339"
  crawljob?: string;
  uploader: string; // email address of uploader
  numwarcs?: string; // number as string, should match the count of warc.gz files in the files array (but not always filled)
  numarcs?: string; // number as string, should match the count of arc.gz files in the files array (but not always filled)
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
