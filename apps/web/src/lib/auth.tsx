'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@onyxhawk/types';

import { api } from './api';
import { clearSession, loadSession, saveSession } from './session';

interface AuthState {
  session: Session | null | undefined; // undefined = hydrating
  setSession: (s: Session) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSessionState(loadSession() ?? null);
  }, []);

  const setSession = useCallback((s: Session) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  const signOut = useCallback(async () => {
    const current = loadSession();
    if (current) {
      try {
        await api.logout(current.refreshToken);
      } catch {
        /* ignore network errors on logout */
      }
    }
    clearSession();
    setSessionState(null);
  }, []);

  return <AuthContext.Provider value={{ session, setSession, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Gate a page on a signed-in customer. Returns the session (or undefined while
 * hydrating). Redirects to /sign-in when signed out. Staff accounts are sent to
 * the admin portal instead of the customer app.
 */
export function useRequireAuth(): Session | null | undefined {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace('/sign-in');
      return;
    }
    if (session.user.role === 'ADMIN' || session.user.role === 'SUPPORT') {
      // Operators belong in the admin portal, not the customer app.
      router.replace('/sign-in');
    }
  }, [session, router]);

  return session;
}
