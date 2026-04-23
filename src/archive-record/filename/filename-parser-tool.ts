import { parseAlexaRecordFilename } from "./alexa-filename-parser.js";

function main(argv: string[]) {
  if (argv.length < 3) {
    console.error("Usage: tsx filename-parser-tool.ts filename [captureTimestamp YYYYMMDDhhmmss]");
    process.exit(1);
  }

  const filename = argv[2];
  const timestamp = argv[3];

  const result = parseAlexaRecordFilename(filename, timestamp);
  console.log(result);
}

main(process.argv);
