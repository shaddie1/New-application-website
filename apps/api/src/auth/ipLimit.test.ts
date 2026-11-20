import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { clientIp, createIpLimiter, limitByIp } from './ipLimit.js';

describe('createIpLimiter', () => {
  it('allows the limit, refuses the next request, and opens again when the window ends', () => {
    let t = 0;
    const limiter = createIpLimiter({ limit: 2, windowMs: 60_000, now: () => t });

    expect(limiter.take('a')).toEqual({ ok: true });
    expect(limiter.take('a')).toEqual({ ok: true });
    t = 15_000;
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterSec: 45 });
    expect(limiter.take('b')).toEqual({ ok: true });
    t = 60_000;
    expect(limiter.take('a')).toEqual({ ok: true });
  });
});

describe('limitByIp', () => {
  async function server(limit: number) {
    const app = Fastify();
    app.post('/x', { preHandler: limitByIp(createIpLimiter({ limit, windowMs: 60_000 })) }, async () => ({ ok: true }));
    return app;
  }

  it('answers 429 with a wait time once one connection passes the limit', async () => {
    const app = await server(1);
    expect((await app.inject({ method: 'POST', url: '/x' })).statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/x' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.json().code).toBe('RATE_LIMITED');
  });

  it('counts each caller Cloudflare names separately', async () => {
    const app = await server(1);
    const from = (ip: string) => app.inject({ method: 'POST', url: '/x', headers: { 'cf-connecting-ip': ip } });

    expect((await from('203.0.113.1')).statusCode).toBe(200);
    expect((await from('203.0.113.2')).statusCode).toBe(200);
    expect((await from('203.0.113.1')).statusCode).toBe(429);
  });
});

describe('clientIp', () => {
  it("uses Cloudflare's address when present, else the connection's", () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': ' 198.51.100.7 ' }, ip: '10.0.0.1' } as never)).toBe('198.51.100.7');
    expect(clientIp({ headers: {}, ip: '10.0.0.1' } as never)).toBe('10.0.0.1');
  });
});
