import { create } from 'zustand';
import type { Session } from '@onyxhawk/types';
import { clearSession, loadSession, saveSession } from './storage';

interface AuthState {
  /** undefined = not yet checked; null = checked, signed out; Session = signed in */
  session: Session | null | undefined;
  hydrate: () => Promise<void>;
  setSession: (session: Session) => Promise<void>;
  updateTokens: (tokens: Pick<Session, 'accessToken' | 'accessExpiresAt' | 'refreshToken' | 'refreshExpiresAt'>) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: undefined,
  hydrate: async () => {
    const stored = await loadSession();
    set({ session: stored ?? null });
  },
  setSession: async (session) => {
    await saveSession(session);
    set({ session });
  },
  updateTokens: async (tokens) => {
    const current = get().session;
    if (!current) return;
    const next: Session = { ...current, ...tokens };
    await saveSession(next);
    set({ session: next });
  },
  signOut: async () => {
    await clearSession();
    set({ session: null });
  },
}));
