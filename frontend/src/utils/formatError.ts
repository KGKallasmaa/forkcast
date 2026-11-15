// Turns a raw generation error into something a person can act on.
// The backend sometimes forwards the provider's error verbatim (a JSON
// ApiError object), and the store keeps the raw string so App.tsx can still
// detect the RATE_LIMITED: prefix. Formatting happens only at display time,
// so no API contract or store shape changes.
export function formatError(raw: string | null | undefined): string {
  if (!raw) return 'Something went wrong';
  const text = raw.trim();

  // The app's own rate limit is encoded as RATE_LIMITED:<reset epoch ms>.
  if (text.startsWith('RATE_LIMITED:')) {
    return "You've reached today's generation limit. Try again after it resets.";
  }

  // Pull the message out of a raw JSON error object, e.g.
  // {"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED"}}.
  // If it looks like JSON but won't parse, say so plainly — never show the
  // raw JSON to the user.
  let message = text;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; status?: string; code?: number };
      };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      return 'Something went wrong while generating your plan. Please try again.';
    }
  }

  // Match against the message plus the raw text, so status/code words in a
  // JSON wrapper (RESOURCE_EXHAUSTED, 400) are visible to the rules too.
  const haystack = `${message} ${text}`.toLowerCase();

  // Network failure — the request never reached the backend, so there is no
  // status or provider error to interpret. On Render's free tier the backend
  // sleeps after 15 minutes idle, so the first request after a pause can
  // fail while it wakes up. Say that plainly instead of showing the raw
  // browser error ("Failed to fetch").
  if (
    haystack.includes('failed to fetch') ||
    haystack.includes('networkerror') ||
    haystack.includes('network request failed') ||
    haystack.includes('load failed')
  ) {
    return "Couldn't reach the server — it may be waking up after being idle. Wait a moment and try again.";
  }

  // Daily quota (Gemini free tier: 20 requests/day per model).
  if (
    haystack.includes('resource_exhausted') ||
    haystack.includes('generate_content_free_tier_requests') ||
    (haystack.includes('quota') && haystack.includes('per day'))
  ) {
    return 'Daily limit reached — the quota resets at midnight PT (1:30 PM IST).';
  }
  if (haystack.includes('429') || haystack.includes('too many requests')) {
    return 'The AI service is busy right now. Please wait a moment and try again.';
  }
  if (haystack.includes('invalid_argument') || haystack.includes('invalid argument')) {
    return "Something wasn't right with that request. Please try again.";
  }
  if (
    haystack.includes('overloaded') ||
    haystack.includes('unavailable') ||
    haystack.includes('503')
  ) {
    return 'The AI service is overloaded right now. Please try again in a bit.';
  }
  if (haystack.includes('timed out') || haystack.includes('timeout')) {
    return 'That took too long and timed out. Please try again.';
  }

  // Anything else is already a human sentence from our own code
  // ('Stream ended without a result', 'Something went wrong', ...).
  return message;
}
