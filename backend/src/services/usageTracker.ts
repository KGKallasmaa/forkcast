import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Tracks Gemini generate_content requests against the free-tier daily quota
// (20 requests/day per model, resetting at midnight Pacific Time) so Ajey
// can see how much is left instead of hitting the wall blind. Every
// dispatched attempt counts — including retries, which are new requests
// against the same quota. Counts live in usage.json (backend/usage.json at
// runtime) so they survive a backend restart; the file is gitignored.

const PT_TIME_ZONE = 'America/Los_Angeles';

// Pacific-Time calendar date as YYYY-MM-DD, e.g. '2026-11-15'. The quota
// day follows Pacific Time, not the server's local time.
export function getPacificDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface UsageSnapshot {
  date: string; // Pacific-Time date the counts belong to
  limit: number;
  models: Record<string, number>; // counts for that date only
}

// On disk: { [ptDate]: { [model]: count } }, e.g.
// { "2026-11-15": { "gemini-3.5-flash-lite": 7 } }
type UsageFile = Record<string, Record<string, number>>;

export class UsageTracker {
  private counts: UsageFile = {};

  constructor(
    private readonly filePath: string,
    private readonly limit: number,
    private readonly now: () => Date = () => new Date()
  ) {
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.counts = parsed as UsageFile;
        }
      }
    } catch {
      // A corrupt or unreadable file must not take the backend down;
      // start from zero and overwrite it on the next record.
      this.counts = {};
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.counts, null, 2));
    } catch {
      // Persistence is best-effort; the in-memory count still works.
    }
  }

  // Record one dispatched attempt and return the model's count for today.
  record(model: string): { count: number; limit: number } {
    const date = getPacificDate(this.now());
    const day = (this.counts[date] ??= {});
    day[model] = (day[model] ?? 0) + 1;
    this.save();
    return { count: day[model], limit: this.limit };
  }

  // Today's counts only. A new Pacific date reads as zero for every model.
  getToday(): UsageSnapshot {
    const date = getPacificDate(this.now());
    return { date, limit: this.limit, models: { ...(this.counts[date] ?? {}) } };
  }
}

// The daily limit is the Gemini free-tier number (20 generate_content
// requests/day per model). Groq attempts are counted by model name too,
// but Groq's own free-tier cap differs — do not read this limit as a
// Groq quota.
const GEMINI_DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT) || 20;
// USAGE_FILE is a test seam (the harness points it at a temp file). The
// backend always runs from backend/, so usage.json lands in backend/.
const USAGE_FILE = process.env.USAGE_FILE ?? join(process.cwd(), 'usage.json');

export const usageTracker = new UsageTracker(USAGE_FILE, GEMINI_DAILY_LIMIT);
