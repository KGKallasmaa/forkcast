// Server wake-up status for the Sidebar status button. The backend sleeps
// on Render's free tier after 15 minutes idle and takes 30–60s to wake, so
// the button pings /health and, while the server is waking, counts down
// from the typical wake time. Pure helpers here so the label/countdown
// logic is testable without React.

export type ServerStatus = 'idle' | 'checking' | 'waking' | 'awake' | 'unreachable';

// Typical Render free-tier wake time, in seconds. The countdown starts here.
export const WAKE_COUNTDOWN_SECONDS = 60;

// Give up after this many seconds of waking with no response (2 full
// countdown cycles) and show "unreachable" instead of waiting forever.
export const WAKE_UNREACHABLE_SECONDS = 120;

// How often to poll /health while the server is waking, in milliseconds.
export const WAKE_POLL_INTERVAL_MS = 5000;

export function serverStatusLabel(status: ServerStatus, secondsLeft: number | null): string {
  switch (status) {
    case 'idle':
      return 'Check server status';
    case 'checking':
      return 'Checking server…';
    case 'waking':
      return secondsLeft !== null && secondsLeft > 0
        ? `Waking up… ~${secondsLeft}s left`
        : 'Still waking…';
    case 'awake':
      return 'Server awake';
    case 'unreachable':
      return 'Server unreachable — try again';
  }
}
