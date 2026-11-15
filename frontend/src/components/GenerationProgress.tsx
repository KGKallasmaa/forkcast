import { useEffect, useState } from 'react';
import { formatElapsed, getDayStatuses, type PlannedDay } from '../utils/generationProgress';

interface GenerationProgressProps {
  // Timestamp (ms) generation started, or null if unknown.
  startedAt: number | null;
  // The days this request will produce, from the request's start date and
  // day count. Empty for regeneration, which has no day list.
  plannedDays: PlannedDay[];
  // Dates of days that have already arrived via the SSE 'day' events.
  arrivedDates: string[];
  // The latest progress message from the backend ("Generating recipes…").
  progressMessage: string;
  // Compact form (shown above the calendar once days start arriving):
  // header + phase only, no checklist.
  compact?: boolean;
}

function formatDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Live progress for a generation in flight: elapsed timer, current phase,
// and a per-day checklist. Renders from the first moment generation
// starts — before any day has arrived — so the screen is never a static
// spinner while a slow day call is still running.
export default function GenerationProgress({
  startedAt,
  plannedDays,
  arrivedDates,
  progressMessage,
  compact = false,
}: GenerationProgressProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = startedAt !== null ? formatElapsed(now - startedAt) : '00:00';
  const statuses = getDayStatuses(plannedDays, arrivedDates);
  const doneCount = statuses.filter((s) => s.status === 'done').length;
  const total = plannedDays.length;

  return (
    <div className={`gen-progress${compact ? ' gen-progress--compact' : ''}`} role="status">
      <div className="gen-progress__head">
        <div className="loading-spinner loading-spinner--sm" aria-hidden="true" />
        <span className="gen-progress__title">Generating your meal plan</span>
        <span className="gen-progress__meta">
          <span className="gen-progress__timer">{elapsed}</span>
          {total > 0 && (
            <span className="gen-progress__count">
              {doneCount} of {total} day{total > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>

      <p className="gen-progress__phase">{progressMessage || 'Starting…'}</p>

      {!compact && total > 0 && (
        <ul className="gen-progress__days">
          {statuses.map((s) => (
            <li key={s.date} className={`gen-progress__day gen-progress__day--${s.status}`}>
              <span className="gen-progress__mark" aria-hidden="true">
                {s.status === 'done' ? (
                  '✓'
                ) : s.status === 'writing' ? (
                  <span className="loading-spinner loading-spinner--sm gen-progress__spin" />
                ) : (
                  '○'
                )}
              </span>
              <span className="gen-progress__label">
                {s.day} · {formatDayLabel(s.date)}
              </span>
              <span className="gen-progress__state">
                {s.status === 'done' ? 'Done' : s.status === 'writing' ? 'Writing…' : 'Queued'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
