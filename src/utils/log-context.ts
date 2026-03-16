
export interface LogEntry {
  level: "warn" | "error";
  message: string;
  source?: string;
}

let entries: LogEntry[] = [];

export function resetLog() { entries = []; }
export function getLog(): LogEntry[] { return entries; }
export function logWarning(message: string, source?: string) { entries.push({ level: "warn", message, source }); }
export function logError(message: string, source?: string) { entries.push({ level: "error", message, source }); }
