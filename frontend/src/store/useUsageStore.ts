import { create } from 'zustand';
import { BASE } from '../services/api';

// Not persisted — always re-derived from the backend, which reads directly
// from the same store the rate limiter itself uses (see /api/meal-plan/usage
// in backend/src/index.ts), so this can never drift out of sync with what
// actually gets enforced.
interface UsageState {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number | null;
  // False until the first successful refresh. The defaults above are just
  // placeholders — showing "2 of 2 left" before the real count arrives
  // would claim generations the user may already have used.
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useUsageStore = create<UsageState>((set) => ({
  used: 0,
  limit: 2,
  remaining: 2,
  resetAt: null,
  loaded: false,

  refresh: async () => {
    try {
      const res = await fetch(`${BASE}/api/meal-plan/usage`);
      const json = (await res.json()) as { used: number; limit: number; remaining: number; resetAt: number | null };
      set({ ...json, loaded: true });
    } catch {
      // leave last-known values (and loaded: false, so the UI never
      // presents the placeholder defaults as a real count)
    }
  },
}));