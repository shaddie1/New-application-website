import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessClaims } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
}

/** preHandler that requires a valid Bearer access token. Sets req.auth on success. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing bearer token' });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = await verifyAccessToken(token);
    req.auth = claims;
  } catch (err) {
    req.log.debug({ err }, 'access token verification failed');
    return reply.code(401).send({ error: 'invalid or expired access token' });
  }
}
