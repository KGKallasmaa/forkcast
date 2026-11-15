// Pure helpers for the live generation-progress panel. No React, no store
// access — so they can be unit-tested in isolation.
//
// getPlannedDays mirrors the backend's getPlanDates (aiService.ts):
// UTC throughout, day count clamped to 1..7, day names from the same
// Sunday-first list. The panel's checklist is built from the request the
// frontend already sent, never from the backend.

export interface PlannedDay {
  day: string; // e.g. "Monday"
  date: string; // YYYY-MM-DD
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getPlannedDays(startDate: string, numDays?: number): PlannedDay[] {
  const count = Math.min(Math.max(numDays ?? 7, 1), 7);
  const [y, m, d] = startDate ? startDate.split('-').map(Number) : [];
  const now = new Date();
  const start = new Date(
    Date.UTC(y ?? now.getUTCFullYear(), (m ?? now.getUTCMonth() + 1) - 1, d ?? now.getUTCDate())
  );
  return Array.from({ length: count }, (_, i) => {
    const x = new Date(start);
    x.setUTCDate(x.getUTCDate() + i);
    return {
      day: DAY_NAMES[x.getUTCDay()] ?? 'Monday',
      date: x.toISOString().split('T')[0] ?? '',
    };
  });
}

export type DayStatus = 'done' | 'writing' | 'queued';

export interface PlannedDayStatus extends PlannedDay {
  status: DayStatus;
}

// Each planned day's state from the dates that have arrived so far. Days
// arrive in completion order, so a later day can be done while an earlier
// one is still pending — the first not-yet-arrived day is "writing".
export function getDayStatuses(planned: PlannedDay[], arrivedDates: string[]): PlannedDayStatus[] {
  const arrived = new Set(arrivedDates);
  let writingAssigned = false;
  return planned.map((p) => {
    if (arrived.has(p.date)) return { ...p, status: 'done' as const };
    if (!writingAssigned) {
      writingAssigned = true;
      return { ...p, status: 'writing' as const };
    }
    return { ...p, status: 'queued' as const };
  });
}

// Elapsed time as mm:ss. Hours roll into the minutes (a 7-day plan taking
// over an hour still reads sensibly, e.g. 74:12).
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
