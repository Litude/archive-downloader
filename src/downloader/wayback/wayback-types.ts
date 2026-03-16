
export interface WaybackItemFile {
    name: string;
    source: string;
    mtime: string;
    size: string;
    format: string;
    private: string;
    filecount?: string;
    md5: string;
    crc32: string;
    sha1: string;
}

export interface WaybackMetadata {
    identifier: string;
    contributor: string;
    creator?: string;
    date: string;
    description: string;
    firstfiledate: string; // YYYYMMDDHHMMSS
    lastfiledate: string; // YYYYMMDDHHMMSS
    mediatype: string;
    scanner: string;
    scanningcenter: string;
    sponsor: string;
    subject: string;
    title: string;
    collection: string[];
    publicdate: string; // YYYY-MM-DD HH:MM:SS
    uploader: string; // email
    addeddate: string; // YYYY-MM-DD HH:MM:SS
    imagecount: string; // number as string
    scandate: string; // YYYYMMDDHHMMSS
    boxid: string;
    backup_location: string;
    'fail-reasons': string;
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
        solo_manifest: Record<string, {
            sys_changed_by: {
                source: string,
                task_id: string
            },
            sys_last_changed: string // YYYY-MM-DD HH-MM-SS.mmmmmm
        }>
    }
    solo: boolean;
    uniq: number;
    workable_servers: string[];
}
