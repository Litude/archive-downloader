import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const normalize = args.includes('--normalize');
const filteredArgs = args.filter(a => a !== '--normalize');
const [inputFile, outputFile] = filteredArgs;

if (!inputFile || !outputFile) {
    console.error('Usage: node txt-to-json-urls.js [--normalize] <input.txt> <output.json>');
    console.error('  --normalize  Strip www\\d* prefixes and default port numbers (:80 for http, :443 for https)');
    process.exit(1);
}

function normalizeUrl(url) {
    // Strip www\d* prefix from the hostname
    url = url.replace(/^(https?:\/\/)www\d*(\.)/i, '$1$2');
    // Strip default ports
    url = url.replace(/^(http:\/\/[^/]+):80(\/|$)/i, '$1$2');
    url = url.replace(/^(https:\/\/[^/]+):443(\/|$)/i, '$1$2');
    return url;
}

const entries = readFileSync(inputFile, 'utf8')
    .split('\n')
    .map(line => line.split('¦')[0].trim())
    .filter(url => url !== '')
    .map(url => normalize ? normalizeUrl(url) : url)
    .filter((url, index, arr) => arr.indexOf(url) === index)
    .map(url => ({ url }));

writeFileSync(outputFile, JSON.stringify(entries, null, 4), 'utf8');
console.log(`Written ${entries.length} entries to ${outputFile}`);
