import { describe, expect, it } from 'vitest';
import { formatError } from './formatError';

describe('formatError', () => {
  it('turns a network failure into the waking-up message', () => {
    expect(formatError('Failed to fetch')).toBe(
      "Couldn't reach the server — it may be waking up after being idle. Wait a moment and try again."
    );
    expect(formatError('TypeError: Failed to fetch')).toBe(
      "Couldn't reach the server — it may be waking up after being idle. Wait a moment and try again."
    );
  });

  it('keeps the rate-limit message', () => {
    expect(formatError('RATE_LIMITED:1234567890000')).toBe(
      "You've reached today's generation limit. Try again after it resets."
    );
  });

  it('keeps the daily-quota message', () => {
    expect(
      formatError(
        '{"error":{"code":429,"message":"Quota exceeded for quota metric","status":"RESOURCE_EXHAUSTED"}}'
      )
    ).toBe('Daily limit reached — the quota resets at midnight PT (1:30 PM IST).');
  });

  it('passes through an already-human message', () => {
    expect(formatError('Stream ended without a result')).toBe('Stream ended without a result');
  });

  it('returns a fallback for empty input', () => {
    expect(formatError(null)).toBe('Something went wrong');
    expect(formatError('')).toBe('Something went wrong');
  });
});
