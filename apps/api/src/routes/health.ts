import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ ok: true, ts: new Date().toISOString() }));

  app.get('/ready', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: 'up' };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return reply.code(503).send({ ok: false, db: 'down' });
    }
  });
};
