import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CastId, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb, t } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// Company documents are for the owner and for back-office staff linked to a
// shareholder record. Removing a staff member resets the role to customer and
// leaves the link, so the link alone must not open them.

const DOCUMENTS = '/admin/documents';

beforeEach(() => {
  resetDb();
  seedCast();
  t.companyDocuments = [{
    id: 'doc1', title: 'Certificate of incorporation', category: 'INCORPORATION', description: null,
    fileUrl: 'https://files.example.com/certificate.pdf', fileName: 'certificate.pdf', contentType: 'application/pdf',
    sizeBytes: 1024, isExternal: false, expiresAt: null, uploadedById: 'owner',
    createdAt: new Date('2026-07-15T00:00:00.000Z'), updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  }];
});

describe('GET /admin/documents', () => {
  it.each<CastId>(['owner', 'cooLinked', 'shareholderLinked', 'supportLinked'])(
    'lists the documents for %s',
    async (who) => {
      const res = await requestAs(who, 'GET', DOCUMENTS);

      expect(res.statusCode).toBe(200);
      expect(res.json().documents).toMatchObject([{ id: 'doc1', title: 'Certificate of incorporation', uploadedByName: 'Olive Owner' }]);
    },
  );

  it.each<CastId>(['customerLinked', 'crewLinked'])(
    'refuses %s: a shareholder link on an account that is no longer staff opens nothing',
    async (who) => {
      const res = await requestAs(who, 'GET', DOCUMENTS);

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'shareholder access required' });
    },
  );

  it.each<CastId>(['admin', 'shareholder', 'customer'])('refuses %s, who is linked to no shareholder record', async (who) => {
    const res = await requestAs(who, 'GET', DOCUMENTS);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'shareholder access required' });
  });

  it('refuses a request with no sign-in as unauthorised', async () => {
    expect((await requestAs(null, 'GET', DOCUMENTS)).statusCode).toBe(401);
  });
});
