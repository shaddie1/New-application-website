import { describe, expect, it } from 'vitest';
import type { Session } from '@onyxhawk/types';

import { createSessionRenewal, type RenewalFetch } from './session-refresh';

const REFRESH_URL = 'https://api.test/auth/refresh';

function sessionWith(accessToken: string, refreshToken: string): Session {
  return {
    accessToken,
    accessExpiresAt: '2026-11-12T10:00:00.000Z',
    refreshToken,
    refreshExpiresAt: '2026-12-12T10:00:00.000Z',
    user: { id: 'user-1', phone: '+254700000001', fullName: 'Owner One', role: 'ADMIN' },
  };
}

type RenewalResponse = Awaited<ReturnType<RenewalFetch>>;

/**
 * A stored session and a stand-in for the server's renewal endpoint. The test
 * decides when, and how, each renewal request is answered.
 */
function setup(initial: Session | null) {
  let stored = initial;
  let clears = 0;
  let failures = 0;
  const sentRefreshTokens: string[] = [];
  const answers: ((response: RenewalResponse) => void)[] = [];

  const fetchRenewal: RenewalFetch = (url, init) => {
    expect(url).toBe(REFRESH_URL);
    sentRefreshTokens.push((JSON.parse(init.body) as { refreshToken: string }).refreshToken);
    return new Promise<RenewalResponse>((resolve) => {
      answers.push(resolve);
    });
  };

  const renewal = createSessionRenewal({
    refreshUrl: REFRESH_URL,
    fetch: fetchRenewal,
    load: () => stored,
    save: (next) => {
      stored = next;
    },
    clear: () => {
      stored = null;
      clears += 1;
    },
  });
  renewal.onFailed(() => {
    failures += 1;
  });

  /** Answers every renewal request the server has received and not yet answered. */
  async function answer(response: RenewalResponse) {
    // Let the callers' requests reach the server first.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (answers.length === 0) throw new Error('No renewal request is waiting for an answer');
    for (const resolve of answers.splice(0)) resolve(response);
  }

  return {
    renewal,
    sentRefreshTokens,
    stored: () => stored,
    clears: () => clears,
    failures: () => failures,
    grant: (next: Session) => answer({ ok: true, status: 200, json: async () => next }),
    refuse: () => answer({ ok: false, status: 401, json: async () => ({ error: 'Refresh token reused' }) }),
    /** The server, or something in front of it, is down: no word on the token. */
    serverError: (status: number) => answer({ ok: false, status, json: async () => ({ error: 'Unavailable' }) }),
  };
}

describe('session renewal', () => {
  it('sends one renewal request for six concurrent callers and gives all six the new token', async () => {
    const h = setup(sessionWith('access-0', 'refresh-0'));

    const callers = Array.from({ length: 6 }, () => h.renewal.renew('access-0'));
    await h.grant(sessionWith('access-1', 'refresh-1'));
    const results = await Promise.all(callers);

    expect(h.sentRefreshTokens).toEqual(['refresh-0']);
    expect(results.map((s) => s?.accessToken)).toEqual(Array.from({ length: 6 }, () => 'access-1'));
  });

  it('gives a late caller with the old token the stored session without renewing again', async () => {
    const h = setup(sessionWith('access-0', 'refresh-0'));

    const first = h.renewal.renew('access-0');
    await h.grant(sessionWith('access-1', 'refresh-1'));
    await first;

    // This request left with access-0 and only now hears its 401.
    const late = await h.renewal.renew('access-0');

    expect(late?.accessToken).toBe('access-1');
    expect(h.sentRefreshTokens).toEqual(['refresh-0']);
  });

  it('renews again with the stored refresh token when the renewed token expires', async () => {
    const h = setup(sessionWith('access-0', 'refresh-0'));

    const first = h.renewal.renew('access-0');
    await h.grant(sessionWith('access-1', 'refresh-1'));
    await first;

    const second = h.renewal.renew('access-1');
    await h.grant(sessionWith('access-2', 'refresh-2'));

    expect((await second)?.accessToken).toBe('access-2');
    expect(h.sentRefreshTokens).toEqual(['refresh-0', 'refresh-1']);
    expect(h.stored()?.refreshToken).toBe('refresh-2');
  });

  it('fails every waiting caller, clears the session once and tells the listener once when renewal is refused', async () => {
    const h = setup(sessionWith('access-0', 'refresh-0'));

    const callers = Array.from({ length: 6 }, () => h.renewal.renew('access-0'));
    await h.refuse();
    const results = await Promise.all(callers);

    expect(results).toEqual([null, null, null, null, null, null]);
    expect(h.sentRefreshTokens).toEqual(['refresh-0']);
    expect(h.stored()).toBeNull();
    expect(h.clears()).toBe(1);
    expect(h.failures()).toBe(1);
  });

  it.each([500, 502, 503, 429])('keeps the session when the server answers %i, and renews again on the next try', async (status) => {
    const h = setup(sessionWith('access-0', 'refresh-0'));

    const callers = Array.from({ length: 3 }, () => h.renewal.renew('access-0'));
    await h.serverError(status);

    expect(await Promise.all(callers)).toEqual([null, null, null]);
    expect(h.stored()?.refreshToken).toBe('refresh-0');
    expect(h.clears()).toBe(0);
    expect(h.failures()).toBe(0);

    // The server is back: the same refresh token is still good.
    const retry = h.renewal.renew('access-0');
    await h.grant(sessionWith('access-1', 'refresh-1'));

    expect((await retry)?.accessToken).toBe('access-1');
    expect(h.sentRefreshTokens).toEqual(['refresh-0', 'refresh-0']);
  });

  it('keeps the session when the renewal request never reaches the server, and renews again on the next try', async () => {
    let stored: Session | null = sessionWith('access-0', 'refresh-0');
    let failures = 0;
    let online = false;
    const renewal = createSessionRenewal({
      refreshUrl: REFRESH_URL,
      fetch: async () => {
        if (!online) throw new TypeError('Failed to fetch');
        return { ok: true, status: 200, json: async () => sessionWith('access-1', 'refresh-1') };
      },
      load: () => stored,
      save: (next) => {
        stored = next;
      },
      clear: () => {
        stored = null;
      },
    });
    renewal.onFailed(() => {
      failures += 1;
    });

    expect(await renewal.renew('access-0')).toBeNull();
    expect(stored?.refreshToken).toBe('refresh-0');
    expect(failures).toBe(0);

    online = true;
    expect((await renewal.renew('access-0'))?.accessToken).toBe('access-1');
  });

  it('stops telling a listener that has been removed', async () => {
    const h = setup(sessionWith('access-0', 'refresh-0'));
    let told = 0;
    const remove = h.renewal.onFailed(() => {
      told += 1;
    });
    remove();

    const caller = h.renewal.renew('access-0');
    await h.refuse();
    await caller;

    expect(told).toBe(0);
  });

  const withoutRefreshToken: [string, Session | null][] = [
    ['there is no stored session', null],
    ['the stored session has no refresh token', sessionWith('access-0', '')],
  ];

  it.each(withoutRefreshToken)('does not start a renewal when %s', async (_name, initial) => {
    const h = setup(initial);

    const result = await h.renewal.renew(initial?.accessToken ?? null);

    expect(result).toBeNull();
    expect(h.sentRefreshTokens).toEqual([]);
  });
});
