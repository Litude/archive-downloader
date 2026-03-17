const ARCHIVED_COMMON_HEADERS = ['content-type', 'content-length', 'location', 'content-location', 'content-base', 'content-disposition'];
const WAYBACK_ORIGINAL_HEADER_PREFIX = 'x-archive-orig-';
const COMMONCRAWL_ADDED_HEADER = 'x-archive-orig-x_commoncrawl_';
const ADDRESS_HEADERS = ['location', 'content-location', 'content-base'];

const IisServerHeaderNames: Record<string, string> = {
    'etag': 'ETag',
    'p3p': 'P3P',
    'microsoftofficewebserver': 'MicrosoftOfficeWebServer',
    'x-aspnet-version': 'X-AspNet-Version',
}

function getFixedHeaderName(header: string, server?: string): string {
    if (server && (server.toLowerCase().startsWith('microsoft-iis') || server.toLowerCase().startsWith('apache'))) {
        const fixedName = IisServerHeaderNames[header.toLowerCase()];
        if (!fixedName) {
            const parts = header.toLowerCase().split('-');
            parts.forEach((part, index) => {
                parts[index] = part.charAt(0).toUpperCase() + part.slice(1);
            });
            return parts.join('-');
        }
        else {
            return fixedName;
        }
    }
    else {
        return header;
    }
}

function isOriginalCaptureHeader(header: string): boolean {
    return header.toLowerCase().startsWith(WAYBACK_ORIGINAL_HEADER_PREFIX) && !header.toLowerCase().startsWith(COMMONCRAWL_ADDED_HEADER);
}

function urlOriginWithPort(url: URL): string {
    let origin = url.origin;
    // Origin includes port if it is non-default (i.e. not 80 for http or 443 for https)
    if (url.port) {
        return origin;
    }
    if (origin.startsWith('http://')) {
        return `${origin}:80`;
    } else if (origin.startsWith('https://')) {
        return `${origin}:443`;
    }
    return origin;
}

function cleanupUrlHeader(url: string, location: string): string {
    const isAbsolute = location.startsWith('http://') || location.startsWith('https://');
    if (isAbsolute) {
        const cleaned = location.replace(/^https?:\/\/web\.archive\.org\/web\/\d+[^\/]*\//, '');
        return cleaned;
    }
    // Relative URL
    else {
        const urlObj = new URL(url);
        let cleaned = location.replace(/^\/web\/\d+[^\/]*\//, '');
        const originWithPort = urlOriginWithPort(urlObj);
        if (cleaned.startsWith(originWithPort)) {
            cleaned = cleaned.substring(originWithPort.length);
        } else if (cleaned.startsWith(urlObj.origin)) {
            cleaned = cleaned.substring(urlObj.origin.length);
        }
        return cleaned;
    }

}

export function cleanupWaybackHeaders(url: string, headers: Record<string, string>): { original?: Record<string, string>; reconstructed?: Record<string, string> } {
    const originalHeaders: Record<string, string> = {};
    const reconstructedHeaders: Record<string, string> = {};
    const encounteredOriginalKeys = new Set<string>();
    const server = headers['x-archive-orig-server'] || headers['server'];

    for (const [key, value] of Object.entries(headers)) {
        if (isOriginalCaptureHeader(key)) {
            const originalKey = key.substring(WAYBACK_ORIGINAL_HEADER_PREFIX.length);
            encounteredOriginalKeys.add(originalKey.toLowerCase());
            const fixedOriginalKey = getFixedHeaderName(originalKey, server);
            originalHeaders[fixedOriginalKey] = value;
        }
    }

    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        const fixedKey = getFixedHeaderName(lowerKey, server);
        if (ARCHIVED_COMMON_HEADERS.includes(lowerKey) && !encounteredOriginalKeys.has(lowerKey)) {
            reconstructedHeaders[fixedKey] = ADDRESS_HEADERS.includes(lowerKey) ? cleanupUrlHeader(url, value) : value;
        }
    }

    return {
        original: Object.keys(originalHeaders).length ? originalHeaders : undefined,
        reconstructed: Object.keys(reconstructedHeaders).length ? reconstructedHeaders : undefined,
    }
}
