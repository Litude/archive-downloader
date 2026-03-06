# Truncated HTML captures

These captures indicate that they are gzipped in the header, but they are actually uncompressed. This causes some issues with their handling.

E.g. using axios with maxRedirects: 0 on such captures will cause the whole process to terminate. Workaround: we use a beforeRedirect callback instead (this cannot be used for 301/302 captures however, so hopefully such captures won't exist in the urls that are processed...).


## Example URLs
* https://web.archive.org/web/20081007094105id_/http://www.microsoft.com/brasil/games/age2/default.aspx
* https://web.archive.org/web/20081007093440id_/http://www.microsoft.com/brasil/games/age2/comunidade.aspx


# Truncated other captures

For older captures of larger files, the web archive capture might be incomplete and only contain part of the bytes
