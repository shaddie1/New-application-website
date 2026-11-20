import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * A simple per-connection request counter for the sign-in routes. It is kept
 * in memory, which is enough for the single API server; a restart clears it.
 * The per-account limits in otp.ts are the main guard; this one slows down a
 * single connection that tries many accounts.
 */
export function createIpLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();

  function sweep(t: number) {
    for (const [key, w] of windows) if (w.resetAt <= t) windows.delete(key);
  }

  return {
    /** Counts one request from `key`; says how long to wait once the limit is passed. */
    take(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
      const t = now();
      if (windows.size > 10_000) sweep(t);
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + opts.windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      if (w.count <= opts.limit) return { ok: true };
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)) };
    },
  };
}

/**
 * The caller's address. Requests reach the API through Cloudflare, which sets
 * `cf-connecting-ip` itself, replacing any value the caller sent; elsewhere
 * (local runs, tests) Fastify's own `req.ip` is used.
 */
export function clientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  return typeof cf === 'string' && cf.trim() ? cf.trim() : req.ip;
}

/** A preHandler that answers 429 once a connection passes the limiter. */
export function limitByIp(limiter: ReturnType<typeof createIpLimiter>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = limiter.take(clientIp(req));
    if (result.ok) return;
    return reply
      .code(429)
      .header('retry-after', String(result.retryAfterSec))
      .send({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' });
  };
}
