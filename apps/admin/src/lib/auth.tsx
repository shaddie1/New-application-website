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

  // Sign out automatically after 30 minutes of inactivity.
  useEffect(() => {
    if (!session) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void signOut(), 30 * 60 * 1000);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, signOut]);

  return <AuthContext.Provider value={{ session, setSession, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Redirect to /login unless a signed-in admin/support session exists. */
export function useRequireAdmin(): Session | null | undefined {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPPORT') {
      router.replace('/login');
    }
  }, [session, router]);

  return session;
}
