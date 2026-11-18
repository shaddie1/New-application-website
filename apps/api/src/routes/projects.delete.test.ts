import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Deleting a project that still has jobs under it is refused; nothing is lost.

const userFindUnique = vi.fn();
const projectFindUnique = vi.fn();
const projectDelete = vi.fn();
const jobCount = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    project: { findUnique: projectFindUnique, delete: projectDelete },
    job: { count: jobCount },
  },
}));

const { signAccessToken } = await import('../auth/jwt.js');
const { projectRoutes } = await import('./projects.js');

async function del(id: string) {
  const server = Fastify();
  await server.register(projectRoutes, { prefix: '/admin/projects' });
  const token = (await signAccessToken('support', 'SUPPORT')).token;
  return server.inject({
    method: 'DELETE',
    url: `/admin/projects/${id}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ role: 'SUPPORT', isOwner: false });
  projectDelete.mockResolvedValue({});
});

describe('DELETE /admin/projects/:id', () => {
  it('refuses a project with three jobs, tells the count, and deletes nothing', async () => {
    projectFindUnique.mockResolvedValue({ id: 'p1' });
    jobCount.mockResolvedValue(3);

    const res = await del('p1');

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['error', 'jobCount']);
    expect(body.jobCount).toBe(3);
    expect(body.error).toBe('This project has 3 jobs under it. Ask the owner to move them first.');
    expect(projectDelete).not.toHaveBeenCalled();
  });

  it('deletes a project with no jobs', async () => {
    projectFindUnique.mockResolvedValue({ id: 'p2' });
    jobCount.mockResolvedValue(0);

    const res = await del('p2');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(projectDelete).toHaveBeenCalledWith({ where: { id: 'p2' } });
  });

  it('answers 404 for a project that does not exist', async () => {
    projectFindUnique.mockResolvedValue(null);

    const res = await del('missing');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'project not found' });
    expect(projectDelete).not.toHaveBeenCalled();
  });
});
