import { describe, it, expect } from "vitest";
import { RegexNormalizer, RegexTransformation } from "./regex-transformation";

function normalize(html: string, transforms: RegexTransformation[]): string | null {
    const buf = Buffer.from(html, "latin1");
    const result = RegexNormalizer.normalize(buf, transforms);
    return result ? result.toString("latin1") : null;
}

describe("RegexNormalizer", () => {
    describe("basic replacement", () => {
        it("replaces a pattern with a literal string", () => {
            const result = normalize("Hello World", [
                { pattern: "World", replacement: "Earth" },
            ]);
            expect(result).toBe("Hello Earth");
        });

        it("returns null when nothing changes", () => {
            const result = normalize("Hello Earth", [
                { pattern: "World", replacement: "Earth" },
            ]);
            expect(result).toBeNull();
        });

        it("replaces using capture groups in replacement string", () => {
            const result = normalize('<a href="OLD_LINK">', [
                { pattern: 'href="([^"]+)"', replacement: 'href="new/$1"' },
            ]);
            expect(result).toBe('<a href="new/OLD_LINK">');
        });
    });

    describe("transforms", () => {
        it("lowercases capture groups with captureToLowerCase", () => {
            const result = normalize('<a href="IMAGES/Logo.PNG">', [
                {
                    pattern: 'href="([^"]+)"',
                    replacement: 'href="$1"',
                    transforms: ["captureToLowerCase"],
                },
            ]);
            expect(result).toBe('<a href="images/logo.png">');
        });
    });
});
