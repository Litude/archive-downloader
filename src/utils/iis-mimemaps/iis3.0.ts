/**
IIS 3.0 MIME map
application/x-perfmon,pmw,,5
application/x-perfmon,pml,,5
application/x-perfmon,pmr,,5
application/x-perfmon,pma,,5
application/x-perfmon,pmc,,5
text/x-setext,etx,,0
text/tab-separated-values,tsv,,0
text/richtext,rtx,,0
text/plain,h,,0
text/plain,c,,0
text/plain,bas,,0
text/html,stm,,h
image/x-xwindowdump,xwd,,:
image/x-xbitmap,xbm,,:
image/x-rgb,rgb,,:
image/x-portable-pixmap,ppm,,:
image/x-portable-graymap,pgm,,:
image/x-portable-bitmap,pbm,,:
image/x-portable-anymap,pnm,,:
image/x-cmu-raster,ras,,:
image/tiff,tif,,:
image/tiff,tiff,,:
image/ief,ief,,:
audio/x-pn-realaudio,ram,,<
audio/x-wav,wav,,<
audio/x-aiff,aifc,,<
audio/x-aiff,aiff,,<
audio/x-aiff,aif,,<
audio/basic,snd,,<
audio/basic,au,,<
application/x-ustar,ustar,,5
application/x-tar,tar,,5
application/x-sv4crc,sv4crc,,5
application/x-sv4cpio,sv4cpio,,5
application/x-shar,shar,,5
application/x-gtar,gtar,,9
application/x-cpio,cpio,,5
application/x-bcpio,bcpio,,5
application/x-wais-source,src,,7
application/x-troff-ms,ms,,5
application/x-troff-me,me,,5
application/x-troff-man,man,,5
application/x-troff,roff,,5
application/x-troff,tr,,5
application/x-troff,t,,5
application/x-texinfo,texi,,5
application/x-texinfo,texinfo,,5
application/x-tex,tex,,5
application/x-tcl,tcl,,5
application/x-sh,sh,,5
application/x-netcdf,cdf,,5
application/x-netcdf,nc,,5
application/x-latex,latex,,5
application/x-hdf,hdf,,5
application/x-dvi,dvi,,5
application/x-csh,csh,,5
application/x-mswrite,wri,,5
application/x-msworks,wks,,5
application/x-msterminal,trm,,5
application/x-mspublisher,pub,,5
application/x-msproject,mpp,,5
application/x-mspowerpoint,ppt,,5
application/x-msmoney,mny,,5
application/x-msmediaview,m14,,5
application/x-msmediaview,m13,,5
application/x-msexcel,xlw,,5
application/x-msexcel,xlt,,5
application/x-msexcel,xls,,5
application/x-msexcel,xlm,,5
application/x-msexcel,xlc,,5
application/x-msexcel,xla,,5
application/x-msclip,clp,,5
application/x-mscardfile,crd,,5
application/x-msaccess,mdb,,5
application/envoy,evy,,5
image/x-cmx,cmx,,5
image/cis-cod,cod,,5
application/x-director,dxr,,5
application/x-director,dir,,5
application/x-director,dcr,,5
x-world/x-vrml,wrz,,5
x-world/x-vrml,flr,,5
x-world/x-vrml,xof,,5
x-world/x-vrml,xaf,,5
x-world/x-vrml,wrl,,5
video/x-sgi-movie,movie,,<
video/quicktime,mov,,;
video/quicktime,qt,,;
video/x-msvideo,avi,,<
video/mpeg,mpe,,;
video/mpeg,mpg,,;
video/mpeg,mpeg,,;
application/winhlp,hlp,,5
application/msword,dot,,5
application/msword,doc,,5
application/mac-binhex40,hqx,,4
application/postscript,eps,,5
application/postscript,ai,,5
application/postscript,ps,,5
application/rtf,rtf,,5
application/zip,zip,,9
application/oda,oda,,5
application/octet-stream,bin,,5
application/pdf,pdf,,5
application/octet-stream,*,,5
image/bmp,bmp,,:
image/jpeg,jpe,,:
image/jpeg,jpeg,,:
text/html,html,,h
text/plain,txt,,0
image/jpeg,jpg,,:
image/gif,gif,,g
text/html,htm,,h
image/x-xxpixmap,xpm,,:
application/x-msmemetafile,wmf,,5
application/x-msdownload,exe,,5
video/avi,avi,,<
image/x-xpixmap,xpm,,:
application/x-msmetafile,wmf,,5
application/octet-stream,exe,,5
 */

export const iis30ExtToMime: Record<string, string[]> = {
  "*": ["application/octet-stream"],
  ai: ["application/postscript"],
  aifc: ["audio/x-aiff"],
  aiff: ["audio/x-aiff"],
  aif: ["audio/x-aiff"],
  au: ["audio/basic"],
  avi: ["video/avi", "video/x-msvideo"],
  bas: ["text/plain"],
  bcpio: ["application/x-bcpio"],
  bin: ["application/octet-stream"],
  bmp: ["image/bmp"],
  c: ["text/plain"],
  cdf: ["application/x-netcdf"],
  clp: ["application/x-msclip"],
  cmx: ["image/x-cmx"],
  cod: ["image/cis-cod"],
  cpio: ["application/x-cpio"],
  crd: ["application/x-mscardfile"],
  csh: ["application/x-csh"],
  dcr: ["application/x-director"],
  dir: ["application/x-director"],
  doc: ["application/msword"],
  dot: ["application/msword"],
  dvi: ["application/x-dvi"],
  dxr: ["application/x-director"],
  eps: ["application/postscript"],
  etx: ["text/x-setext"],
  evy: ["application/envoy"],
  exe: ["application/octet-stream", "application/x-msdownload"],
  flr: ["x-world/x-vrml"],
  gif: ["image/gif"],
  gtar: ["application/x-gtar"],
  h: ["text/plain"],
  hdf: ["application/x-hdf"],
  hlp: ["application/winhlp"],
  hqx: ["application/mac-binhex40"],
  htm: ["text/html"],
  html: ["text/html"],
  ief: ["image/ief"],
  jpe: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  latex: ["application/x-latex"],
  m13: ["application/x-msmediaview"],
  m14: ["application/x-msmediaview"],
  man: ["application/x-troff-man"],
  mdb: ["application/x-msaccess"],
  me: ["application/x-troff-me"],
  mny: ["application/x-msmoney"],
  mov: ["video/quicktime"],
  movie: ["video/x-sgi-movie"],
  mpe: ["video/mpeg"],
  mpeg: ["video/mpeg"],
  mpg: ["video/mpeg"],
  mpp: ["application/x-msproject"],
  ms: ["application/x-troff-ms"],
  nc: ["application/x-netcdf"],
  oda: ["application/oda"],
  pbm: ["image/x-portable-bitmap"],
  pdf: ["application/pdf"],
  pgm: ["image/x-portable-graymap"],
  pma: ["application/x-perfmon"],
  pmc: ["application/x-perfmon"],
  pml: ["application/x-perfmon"],
  pmr: ["application/x-perfmon"],
  pmw: ["application/x-perfmon"],
  pnm: ["image/x-portable-anymap"],
  ppm: ["image/x-portable-pixmap"],
  ppt: ["application/x-mspowerpoint"],
  ps: ["application/postscript"],
  pub: ["application/x-mspublisher"],
  qt: ["video/quicktime"],
  ram: ["audio/x-pn-realaudio"],
  ras: ["image/x-cmu-raster"],
  rgb: ["image/x-rgb"],
  roff: ["application/x-troff"],
  rtf: ["application/rtf"],
  rtx: ["text/richtext"],
  sh: ["application/x-sh"],
  shar: ["application/x-shar"],
  snd: ["audio/basic"],
  src: ["application/x-wais-source"],
  stm: ["text/html"],
  sv4cpio: ["application/x-sv4cpio"],
  sv4crc: ["application/x-sv4crc"],
  t: ["application/x-troff"],
  tar: ["application/x-tar"],
  tcl: ["application/x-tcl"],
  tex: ["application/x-tex"],
  texi: ["application/x-texinfo"],
  texinfo: ["application/x-texinfo"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  tr: ["application/x-troff"],
  trm: ["application/x-msterminal"],
  tsv: ["text/tab-separated-values"],
  txt: ["text/plain"],
  ustar: ["application/x-ustar"],
  wav: ["audio/x-wav"],
  wks: ["application/x-msworks"],
  wmf: ["application/x-msmemetafile", "application/x-msmetafile"],
  wri: ["application/x-mswrite"],
  wrl: ["x-world/x-vrml"],
  wrz: ["x-world/x-vrml"],
  xaf: ["x-world/x-vrml"],
  xbm: ["image/x-xbitmap"],
  xla: ["application/x-msexcel"],
  xlc: ["application/x-msexcel"],
  xlm: ["application/x-msexcel"],
  xls: ["application/x-msexcel"],
  xlt: ["application/x-msexcel"],
  xlw: ["application/x-msexcel"],
  xof: ["x-world/x-vrml"],
  xpm: ["image/x-xxpixmap", "image/x-xpixmap"],
  xwd: ["image/x-xwindowdump"],
  zip: ["application/zip"],
};

