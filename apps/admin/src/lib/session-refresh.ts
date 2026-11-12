import type { Session } from '@onyxhawk/types';

/**
 * Session renewal for the admin, kept free of browser globals so it can be
 * tested without a DOM. api.ts wires it to `fetch` and localStorage.
 *
 * The server rotates the refresh token on every renewal and treats a second use
 * of a rotated one as theft: it revokes every session the user has
 * (`rotateRefreshToken` in apps/api/src/auth/tokens.ts). A page that fires six
 * requests on an expired access token must therefore renew once, not six times.
 */

/** The one call renewal makes. The browser's `fetch` fits this shape. */
export type RenewalFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface SessionRenewalDeps {
  refreshUrl: string;
  fetch: RenewalFetch;
  load: () => Session | null;
  save: (session: Session) => void;
  clear: () => void;
}

export interface SessionRenewal {
  /**
   * Call after a 401. `sentAccessToken` is the token the refused request
   * carried. Resolves to the session to retry with, or null when there is none.
   */
  renew: (sentAccessToken: string | null) => Promise<Session | null>;
  /**
   * Registers the one listener told when the server refuses a renewal and the
   * stored session has been cleared. Returns a function that removes it.
   */
  onFailed: (listener: () => void) => () => void;
}

export function createSessionRenewal(deps: SessionRenewalDeps): SessionRenewal {
  let inFlight: Promise<Session | null> | null = null;
  let failedListener: (() => void) | null = null;

  async function requestRenewal(refreshToken: string): Promise<Session | null> {
    try {
      const res = await deps.fetch(deps.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        deps.clear();
        failedListener?.();
        return null;
      }
      const next = (await res.json()) as Session;
      deps.save(next);
      return next;
    } catch {
      // The request never got an answer. The session stays, as it did before.
      return null;
    }
  }

  function renew(sentAccessToken: string | null): Promise<Session | null> {
    const stored = deps.load();
    if (!stored) return Promise.resolve(null);

    // Someone else already renewed while this request was in the air.
    if (stored.accessToken !== sentAccessToken) return Promise.resolve(stored);

    if (!stored.refreshToken) return Promise.resolve(null);

    if (!inFlight) {
      inFlight = requestRenewal(stored.refreshToken).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  return {
    renew,
    onFailed(listener) {
      failedListener = listener;
      return () => {
        if (failedListener === listener) failedListener = null;
      };
    },
  };
}
