import fs from "fs";
import { CsvWriter } from "csv-writer/src/lib/csv-writer.js";
import { ObjectMap } from "csv-writer/src/lib/lang/object.js";
import { sleep } from "./sleep.js";

export async function writeCsvRecordsSafe<T>(
  csvWriter: CsvWriter<ObjectMap<T>>,
  records: ObjectMap<T>[],
): Promise<void> {
  while (true) {
    try {
      return await csvWriter.writeRecords(records);
    } catch (error) {
      console.error("Error writing CSV records, retrying in 10 seconds...", error);
      sleep(10000);
    }
  }
}

export async function writeFileSafe(filePath: string, data: string | Buffer): Promise<void> {
  while (true) {
    try {
      await fs.promises.writeFile(filePath, data);
      return;
    } catch (error) {
      console.error("Error writing file, retrying in 10 seconds...", error);
      await sleep(10000);
    }
  }
}
