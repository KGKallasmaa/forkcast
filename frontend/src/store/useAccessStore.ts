import { create } from 'zustand';
import { BASE } from '../services/api';

// Not persisted — always re-derived from the httpOnly signed cookie via the
// backend. The cookie itself is what actually grants the rate-limit bypass;
// this store just mirrors its status so the UI can show it.
interface AccessState {
  trusted: boolean;
  initialize: () => Promise<void>;
}

export const useAccessStore = create<AccessState>((set) => ({
  trusted: false,

  initialize: async () => {
    try {
      const res = await fetch(`${BASE}/api/access/status`);
      const json = (await res.json()) as { trusted: boolean };
      set({ trusted: json.trusted });
    } catch {
      set({ trusted: false });
    }
  },
}));