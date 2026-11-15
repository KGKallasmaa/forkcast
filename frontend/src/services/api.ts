import type { MealPlanRequest } from '../store/useMealPlanStore';
import type { DayPlan, MealPlan, Recipe } from '../types/mealPlan';

// Build-time backend origin. Render sets VITE_API_URL from the backend
// service's host via fromService (a bare hostname, no scheme); a full URL
// also works. In dev the var is unset, so BASE stays '' and the Vite dev
// proxy handles /api. In production the build bakes in the backend URL, so
// the browser calls the backend directly — no proxy in the path, which is
// what keeps the SSE meal-plan stream unbuffered (Render's static-site
// rewrite proxy buffers streaming responses; see DEPLOY.md).
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const BASE = apiUrl
  ? apiUrl.startsWith('http')
    ? apiUrl
    : `https://${apiUrl}`
  : '';

interface SseEvent {
    type: 'progress' | 'day' | 'done' | 'error';
    message?: string;
    success?: boolean;
    data?: unknown;
    day?: DayPlan;
    error?: string;
}

async function streamRequest<T>(
  payload: MealPlanRequest,
  onProgress: (msg: string) => void,
  // Fires for each day as the backend finishes writing it, so the UI can
  // render days as they arrive. Regeneration never sends day events.
  onDay?: (day: DayPlan) => void
): Promise<T> {
  // The backend sleeps on Render's free tier after 15 minutes idle, so the
  // first request after a pause can fail at the network level while it wakes
  // up. Retry a network failure once after a short delay instead of failing
  // the generation outright. Only network errors are retried — an HTTP
  // response (429, 400, 500) is a real answer from the server and is handled
  // below, not retried.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}/api/meal-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      break;
    } catch (err) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw err;
    }
  }

  if (res.status === 429) {
    const resetHeader = res.headers.get('RateLimit-Reset');
    const resetAt = resetHeader
      ? Date.now() + parseInt(resetHeader) * 1000
      : Date.now() + 24 * 60 * 60 * 1000;
    throw new Error(`RATE_LIMITED:${resetAt}`);
  }

  if (!res.body) throw new Error('No response stream from server');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE messages are delimited by double newlines
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;

      let event: SseEvent;
      try {
        event = JSON.parse(dataLine.slice(6)) as SseEvent;
      } catch {
        continue;
      }

      if (event.type === 'progress' && event.message) {
        onProgress(event.message);
      } else if (event.type === 'day' && event.day) {
        onDay?.(event.day);
      } else if (event.type === 'done') {
        if (!event.success) throw new Error(event.error ?? 'Generation failed');
        return event.data as T;
      } else if (event.type === 'error') {
        throw new Error(event.error ?? 'Generation failed');
      }
    }
  }

  throw new Error('Stream ended without a result');
}

export async function fetchMealPlan(
  payload: MealPlanRequest,
  onProgress: (msg: string) => void,
  onDay?: (day: DayPlan) => void
): Promise<MealPlan> {
  return streamRequest<MealPlan>(payload, onProgress, onDay);
}

export interface RegenMeal {
  day: string;
  mealType: string;
  recipe: Recipe;
}

export async function fetchRegenMeals(
  payload: MealPlanRequest,
  onProgress: (msg: string) => void
): Promise<RegenMeal[]> {
  return streamRequest<RegenMeal[]>(payload, onProgress);
}