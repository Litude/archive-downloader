"x-archive-orig-server": "Microsoft-IIS/3.0",
"x-archive-orig-server": "Microsoft-IIS/4.0",
"x-archive-orig-server": "Microsoft-IIS/5.0",
"x-archive-orig-server": "Microsoft-IIS/6.0",
"x-archive-orig-server": "Microsoft-IIS/7.5",
"x-archive-orig-server": "Microsoft-IIS/8.0",

Formatting of Last-Modified header uses FileTimeToSystemTime.

System time only allows millisecond precision. Does the function truncate any overflowing nanosends? Perhaps.

--> Any recovered exact timestamp should have a matching second as well, which can be used to increase recovery accuracy


```
writeEtag(fileTime, metadataChangeNumber):
    // Treat the 8-byte FILETIME as a raw byte array
    bytes = fileTime as byte[8]    // little-endian in memory

    output = '"'

    // Encode each byte of the FILETIME as hex, with leading-zero suppression per byte
    for each byte in bytes:
        highNibble = byte >> 4
        lowNibble  = byte & 0xF

        if highNibble != 0:
            output += toHex(highNibble)   // skip leading zero of this byte
        output += toHex(lowNibble)        // always write low nibble

    // Append metadataChangeNumber as lowercase hex string
    output += ':'
    output += toHexString(metadataChangeNumber)
    output += '"'

    return output
```

