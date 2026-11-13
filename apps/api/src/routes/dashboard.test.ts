import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAccess, DashboardSection } from '@onyxhawk/types';

import { CAST, type CastId, holderIdOf, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The access address tells the Dashboard which sections to build. It answers
// from the user's record, never from the token.

const ACCESS = '/admin/dashboard/access';

async function accessOf(who: CastId): Promise<DashboardAccess> {
  const res = await requestAs(who, 'GET', ACCESS);
  expect(res.statusCode).toBe(200);
  return res.json().access;
}

beforeEach(() => {
  resetDb();
  seedCast();
});

describe('GET /admin/dashboard/access', () => {
  // The access column of the plan's access table.
  it.each<[CastId, DashboardSection[]]>([
    ['owner', ['attention', 'month', 'trend', 'breakdown', 'ownership']],
    ['admin', ['attention', 'month', 'trend', 'breakdown']],
    ['coo', ['attention', 'month', 'trend', 'breakdown']],
    ['cooLinked', ['attention', 'month', 'trend', 'breakdown', 'ownership']],
    ['finance', ['month', 'trend', 'breakdown']],
    ['shareholderLinked', ['ownership']],
    ['shareholder', []],
    ['support', ['attention']],
    ['supervisor', ['attention']],
    ['marketing', ['attention']],
    ['supportLinked', ['attention', 'ownership']],
    ['demoted', ['attention']],
  ])('answers %s with sections %j', async (who, sections) => {
    expect((await accessOf(who)).sections).toEqual(sections);
  });

  it('gives the owner every answer', async () => {
    expect(await accessOf('owner')).toEqual({
      sections: ['attention', 'month', 'trend', 'breakdown', 'ownership'],
      canSetTargets: true,
      canManageOwnership: true,
      holder: 'not-linked',
    });
  });

  it('tells a COO who holds shares that the account is linked, and that ownership is not theirs to manage', async () => {
    expect(await accessOf('cooLinked')).toEqual({
      sections: ['attention', 'month', 'trend', 'breakdown', 'ownership'],
      canSetTargets: true,
      canManageOwnership: false,
      holder: 'linked',
    });
  });

  it('AE12: answers from the record when the token says ADMIN and the record says SUPPORT', async () => {
    expect(CAST.demoted).toMatchObject({ role: 'SUPPORT', tokenRole: 'ADMIN' });

    expect(await accessOf('demoted')).toEqual({
      sections: ['attention'],
      canSetTargets: false,
      canManageOwnership: false,
      holder: 'not-linked',
    });
  });

  it('answers a SHAREHOLDER account with no shareholder record 200, with an empty list and "not-linked"', async () => {
    expect(await accessOf('shareholder')).toEqual({
      sections: [],
      canSetTargets: false,
      canManageOwnership: false,
      holder: 'not-linked',
    });
  });

  it('a removed shareholder row, which no longer points at the account, does not make it a holder', async () => {
    expect((await accessOf('shareholderLinked')).holder).toBe('linked');
    // As the Ownership page leaves a removed holder: the row stays, marked removed, with no account.
    Object.assign(t.shareholders.find((s) => s.id === holderIdOf('shareholderLinked'))!, {
      removedAt: new Date('2026-11-10T09:00:00.000Z'),
      userId: null,
    });

    expect(await accessOf('shareholderLinked')).toMatchObject({ sections: [], holder: 'not-linked' });
  });

  it('a removed shareholder row that still points at the account does not make it a holder either', async () => {
    t.shareholders.find((s) => s.id === holderIdOf('supportLinked'))!.removedAt = new Date('2026-11-10T09:00:00.000Z');

    expect(await accessOf('supportLinked')).toMatchObject({ sections: ['attention'], holder: 'not-linked' });
  });

  it.each<CastId>(['customer', 'customerLinked', 'crew', 'crewLinked'])('refuses %s', async (who) => {
    const res = await requestAs(who, 'GET', ACCESS);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'admin access required' });
  });

  it('refuses a request with no sign-in as unauthorised', async () => {
    expect((await requestAs(null, 'GET', ACCESS)).statusCode).toBe(401);
  });

  it('tells the browser not to keep the answer', async () => {
    const res = await requestAs('admin', 'GET', ACCESS);

    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('the guards other routes put in front of a section', () => {
  /** A bare server with one address behind each guard, in the hook order a route uses. */
  async function guarded(who: CastId | null, url: '/month' | '/ownership' | '/targets') {
    const { requireAuth } = await import('../auth/middleware.js');
    const { signAccessToken } = await import('../auth/jwt.js');
    const { attachDashboardActor, requireSection, requireTargetSetter } = await import('../dashboard/guards.js');
    const server = Fastify();
    server.addHook('preHandler', requireAuth);
    server.addHook('preHandler', attachDashboardActor);
    server.get('/month', { preHandler: requireSection('month') }, async () => ({ ok: true }));
    server.get('/ownership', { preHandler: requireSection('ownership') }, async () => ({ ok: true }));
    server.put('/targets', { preHandler: requireTargetSetter }, async () => ({ ok: true }));
    const headers: Record<string, string> = {};
    if (who) {
      const { role, tokenRole }: { role: string; tokenRole?: string } = CAST[who];
      headers.authorization = `Bearer ${(await signAccessToken(who, tokenRole ?? role)).token}`;
    }
    return server.inject({ method: url === '/targets' ? 'PUT' : 'GET', url, headers });
  }

  it.each<CastId>(['owner', 'admin', 'coo', 'finance'])('requireSection("month") lets %s through', async (who) => {
    expect((await guarded(who, '/month')).statusCode).toBe(200);
  });

  it.each<CastId>(['shareholderLinked', 'support', 'demoted', 'customer', 'crewLinked'])(
    'requireSection("month") refuses %s',
    async (who) => {
      const res = await guarded(who, '/month');

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'dashboard section access required' });
    },
  );

  it.each<CastId>(['owner', 'cooLinked', 'shareholderLinked', 'supportLinked'])(
    'requireSection("ownership") lets %s through',
    async (who) => {
      expect((await guarded(who, '/ownership')).statusCode).toBe(200);
    },
  );

  it.each<CastId>(['admin', 'coo', 'shareholder', 'customerLinked', 'crewLinked'])(
    'requireSection("ownership") refuses %s',
    async (who) => {
      expect((await guarded(who, '/ownership')).statusCode).toBe(403);
    },
  );

  it.each<CastId>(['owner', 'admin', 'coo', 'finance'])('requireTargetSetter lets %s through', async (who) => {
    expect((await guarded(who, '/targets')).statusCode).toBe(200);
  });

  it.each<CastId>(['shareholderLinked', 'support', 'demoted', 'customer'])('requireTargetSetter refuses %s', async (who) => {
    const res = await guarded(who, '/targets');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'target-setting access required' });
  });

  it('answers 401 with no sign-in, before any guard', async () => {
    expect((await guarded(null, '/month')).statusCode).toBe(401);
    expect((await guarded(null, '/targets')).statusCode).toBe(401);
  });
});

describe('a token that is still valid for an account that no longer exists', () => {
  // The token passes requireAuth; it is the missing record that refuses it.
  it.each([ACCESS, '/admin/stats'])('GET %s answers 401', async (url) => {
    t.users = t.users.filter((u) => u.id !== 'support');

    const res = await requestAs('support', 'GET', url);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });
});

describe('a token that says less than the record', () => {
  // /admin/stats sits behind the back-office gate of /admin, which reads the
  // role in the token before the Dashboard's guard reads the record. A role
  // raised after sign-in is therefore held back there, and only there.
  it('token says CUSTOMER, record says SUPPORT: access lists "attention", and stats stays refused until the token is renewed', async () => {
    t.users.find((u) => u.id === 'customer')!.role = 'SUPPORT';

    const access = await requestAs('customer', 'GET', ACCESS);
    const stats = await requestAs('customer', 'GET', '/admin/stats');

    expect(access.statusCode).toBe(200);
    expect(access.json().access.sections).toEqual(['attention']);
    expect(stats.statusCode).toBe(403);
    expect(stats.json()).toEqual({ error: 'admin access required' });
  });
});
