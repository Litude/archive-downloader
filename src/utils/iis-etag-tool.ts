import { DateTime } from "luxon";
import { parseIisEtagDate } from "./iis-etag-parser";
import { parse } from "path";
import { createIisEtagFromDate } from "./iis-etag-creator";


function main(argv: string[]) {
    if (argv.length < 4) {
        console.error("Usage: tsx etag-tool.ts [create|parse] <etag>");
        process.exit(1);
    }

    const command = argv[2];
    if (command === "create") {
        const date = argv[3];
        const etag = createIisEtagFromDate(date);
        console.log(etag);
    }
    else if (command === "parse") {
        const etag = argv[3];

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
}

main(process.argv);
