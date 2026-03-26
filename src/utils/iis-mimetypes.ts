import { iis20ExtToMime } from "./iis-mimemaps/iis2.0.js";
import { iis30ExtToMime } from "./iis-mimemaps/iis3.0.js";
import { iis40ExtToMime } from "./iis-mimemaps/iis4.0.js";
import { iis50ExtToMime } from "./iis-mimemaps/iis5.0.js";
import { iis60rc1ExtToMime } from "./iis-mimemaps/iis6.0rc1.js";
import { iis60RtmExtToMime } from "./iis-mimemaps/iis6.0rtm.js";
import { iis60sp2ExtToMime } from "./iis-mimemaps/iis6.0sp2.js";

function detectIisVersionFromServerHeader(serverHeader: string): string | null {
  const match = serverHeader.match(/Microsoft-IIS\/(\d+\.\d+)/);
  return match ? match[1] : null;
}

export function isIisDefaultMimetype(filename: string, mimetype: string, serverHeader: string): boolean {
  const iisVersion = detectIisVersionFromServerHeader(serverHeader);
  if (!iisVersion) {
    return false;
  }
  // We will assume any iis page with text/html is original, since this could occur for e.g. any kind of error pages...
  if (mimetype === "text/html") {
    return true;
  }

  const extension = filename.split(".").pop()?.toLowerCase() || "";
  if (extension === "asp" || extension === "aspx") {
    return mimetype === "text/html";
  }

  switch (iisVersion) {
  case "2.0": {
    const mimetypes = iis20ExtToMime[extension];
    return mimetypes ? mimetypes.includes(mimetype) : iis20ExtToMime["*"].includes(mimetype);
  }
  case "3.0": {
    const mimetypes = iis30ExtToMime[extension];
    return mimetypes ? mimetypes.includes(mimetype) : iis30ExtToMime["*"].includes(mimetype);
  }
  case "4.0": {
    const mimetypes = iis40ExtToMime[extension];
    return mimetypes ? mimetypes.includes(mimetype) : iis40ExtToMime["*"].includes(mimetype);
  }
  case "5.0": {
    const mimetypes = iis50ExtToMime[extension];
    return mimetypes ? mimetypes.includes(mimetype) : iis50ExtToMime["*"].includes(mimetype);
  }
  case "6.0":
  case "7.0":
  case "7.5":
  case "8.0":
  case "8.5": {
    const mimetypes = [...iis60RtmExtToMime[extension], ...iis60rc1ExtToMime[extension], ...iis60sp2ExtToMime[extension]];
    return mimetypes ? mimetypes.includes(mimetype) : iis60RtmExtToMime["*"].includes(mimetype);
  }
  default:
    console.warn(`Unknown IIS server version: ${iisVersion}`);
    return false;
  }
}
