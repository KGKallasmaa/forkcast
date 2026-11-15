import { describe, expect, it } from 'vitest';
import { serverStatusLabel, WAKE_COUNTDOWN_SECONDS, WAKE_UNREACHABLE_SECONDS } from './serverStatus';

describe('serverStatusLabel', () => {
  it('labels the idle and checking states', () => {
    expect(serverStatusLabel('idle', null)).toBe('Check server status');
    expect(serverStatusLabel('checking', null)).toBe('Checking server…');
  });

  it('counts down while waking and switches to Still waking at 0', () => {
    expect(serverStatusLabel('waking', 60)).toBe('Waking up… ~60s left');
    expect(serverStatusLabel('waking', 1)).toBe('Waking up… ~1s left');
    expect(serverStatusLabel('waking', 0)).toBe('Still waking…');
    expect(serverStatusLabel('waking', null)).toBe('Still waking…');
  });

  it('labels awake and unreachable', () => {
    expect(serverStatusLabel('awake', null)).toBe('Server awake');
    expect(serverStatusLabel('unreachable', null)).toBe('Server unreachable — try again');
  });

  it('the unreachable window is two full countdown cycles', () => {
    expect(WAKE_UNREACHABLE_SECONDS).toBe(2 * WAKE_COUNTDOWN_SECONDS);
  });
});
