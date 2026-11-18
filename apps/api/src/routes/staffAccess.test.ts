import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

// Projects and job reports are back-office routes: a valid token is not
// enough, the caller must be the owner or staff.

const userFindUnique = vi.fn();
const projectFindMany = vi.fn().mockResolvedValue([]);
const jobFindMany = vi.fn().mockResolvedValue([]);
vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    project: { findMany: projectFindMany },
    job: { findMany: jobFindMany },
  },
}));

const { signAccessToken } = await import('../auth/jwt.js');
const { projectRoutes } = await import('./projects.js');
const { jobReportsRoutes } = await import('./jobReports.js');

// Role in the database; the token carries the role the user signed in with.
const users: Record<string, { role: string; isOwner: boolean; tokenRole?: string }> = {
  customer: { role: 'CUSTOMER', isOwner: false },
  crew: { role: 'CREW', isOwner: false },
  support: { role: 'SUPPORT', isOwner: false },
  supervisor: { role: 'CLEANING_SUPERVISOR', isOwner: false },
  owner: { role: 'ADMIN', isOwner: true },
  // Signed in as SUPPORT, since made a customer in the database.
  demoted: { role: 'CUSTOMER', isOwner: false, tokenRole: 'SUPPORT' },
};
userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => users[where.id] ?? null);

async function get(url: string, userId?: string) {
  const server = Fastify();
  await server.register(projectRoutes, { prefix: '/admin/projects' });
  await server.register(jobReportsRoutes, { prefix: '/admin/job-reports' });
  const headers: Record<string, string> = {};
  if (userId) {
    const u = users[userId]!;
    headers.authorization = `Bearer ${(await signAccessToken(userId, u.tokenRole ?? u.role)).token}`;
  }
  return server.inject({ method: 'GET', url, headers });
}

describe.each(['/admin/projects', '/admin/job-reports'])('%s', (url) => {
  it('refuses a request without a token', async () => {
    expect((await get(url)).statusCode).toBe(401);
  });

  it.each(['customer', 'crew', 'demoted'])('refuses %s', async (userId) => {
    const res = await get(url, userId);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'staff access required' });
  });

  it.each(['support', 'supervisor', 'owner'])('lets %s in', async (userId) => {
    expect((await get(url, userId)).statusCode).toBe(200);
  });
});
