import fs from "fs";
import JSON5 from "json5";

export function readFileAsJson5(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    return JSON5.parse(fileContent);
  } catch (error) {
    console.error(`Error reading JSON5 file at ${filePath}:`, error);
    throw error;
  }
}
