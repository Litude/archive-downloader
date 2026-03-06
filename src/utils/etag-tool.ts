import { DateTime } from "luxon";
import { parseIisEtagDate } from "./etag-parser";
import { parse } from "path";


function main(argv: string[]) {
    if (argv.length < 3) {
        console.error("Usage: tsx etag-tool.ts <etag>");
        process.exit(1);
    }
    const etag = argv[2];

    const match = etag.match(/^"?([0-9a-fA-F]+):[0-9a-fA-F]+"?$/);
    let result: string[] | null = null;
    if (match) {
        result = parseIisEtagDate(argv[2], DateTime.now());
    }
    else if (etag.length >= 8 && etag.length <= 16 && /^[0-9a-fA-F]+$/.test(etag)) {
        result = parseIisEtagDate(`"${etag}:0000000000000000"`, DateTime.now());
    }
    else {
        console.error("ETag does not match expected formats");
        process.exit(1);
    }
    if (result) {
        result.sort((a, b) => DateTime.fromISO(a).toMillis() - DateTime.fromISO(b).toMillis());
        console.log("Plausible ETag dates:");
        for (const date of result) {
            console.log(date);
        }
    }
    else {
        console.log("No valid ETag dates found");
    }
}

main(process.argv);
