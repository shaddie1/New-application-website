/**
 * In-memory failed-attempt throttle for password sign-in.
 *
 * Deliberately simple: the API runs as a single instance, and the worst case of
 * a restart is that a would-be attacker's counter resets — the lockout is a
 * brute-force speed bump, not the security boundary (the scrypt hash is).
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };

const attempts = new Map<string, Entry>();

/** Seconds remaining on a lockout, or 0 when the key may attempt a sign-in. */
export function lockoutSecondsRemaining(key: string): number {
  const entry = attempts.get(key);
  if (!entry) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);

  // Start a fresh window when there is no history, or the old one has expired.
  if (!entry || now - entry.firstFailureAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.failures = 0;
    entry.firstFailureAt = now;
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
