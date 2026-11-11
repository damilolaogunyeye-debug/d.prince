import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Small diagnostics log (one JSON object per line) so that real failures can be
 * looked at afterwards instead of guessed. It records server starts, server-side
 * errors and errors reported by the browser's error screen.
 *
 * It never records passwords, cookies, session tokens or form contents.
 */
const DIR = join(process.cwd(), ".portal-logs");
const FILE = join(DIR, "events.jsonl");
const MAX_BYTES = 256 * 1024;

export type DiagnosticEvent = { t: string; kind: string } & Record<string, unknown>;

const clip = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : v);

export function logEvent(kind: string, data: Record<string, unknown> = {}) {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    if (existsSync(FILE) && statSync(FILE).size > MAX_BYTES) {
      const tail = readFileSync(FILE, "utf8").slice(-MAX_BYTES / 2);
      writeFileSync(FILE, tail.slice(tail.indexOf("\n") + 1));
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) clean[k] = clip(v);
    appendFileSync(FILE, JSON.stringify({ t: new Date().toISOString(), kind, ...clean }) + "\n");
  } catch {
    // Diagnostics must never break the app.
  }
}

export function recentEvents(limit = 40): DiagnosticEvent[] {
  try {
    return readFileSync(FILE, "utf8")
      .trim()
      .split("\n")
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line) as DiagnosticEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is DiagnosticEvent => e !== null);
  } catch {
    return [];
  }
}
