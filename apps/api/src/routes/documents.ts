import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DocumentCategory, Prisma } from '@prisma/client';
import type {
  CompanyDocumentDto,
  CreateCompanyDocumentInput,
  DocumentUploadUrlInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { isConfigured, presignUpload } from '../storage/r2.js';

const CATEGORIES = [
  'INCORPORATION', 'TAX', 'LICENCE', 'INSURANCE', 'CONTRACT', 'BANK', 'POLICY', 'MINUTES', 'OTHER',
] as const;

/** Document types we accept for upload, and the extension each maps to. */
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(1000).optional(),
  fileUrl: z.string().trim().url().max(1000),
  fileName: z.string().trim().max(300).optional(),
  contentType: z.string().trim().max(150).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  isExternal: z.boolean().optional(),
  expiresAt: DateStr.nullable().optional(),
}) satisfies z.ZodType<CreateCompanyDocumentInput>;

const UploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(150),
}) satisfies z.ZodType<DocumentUploadUrlInput>;

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireShareholder);

  app.get('/', async (_req, reply) => {
    const rows = await prisma.companyDocument.findMany({
      include: { uploadedBy: { select: { fullName: true } } },
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
    return reply.send({ documents: rows.map(toDto), uploadEnabled: isConfigured() });
  });

  /**
   * Presigned PUT so the browser uploads straight to object storage — the file
   * never passes through the API. Returns 503 when storage is not configured,
   * and the client falls back to storing a link.
   */
  app.post('/upload-url', async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(503).send({ error: 'File storage is not configured — add the document as a link instead.' });
    }

    const parsed = UploadUrlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ext = ALLOWED_TYPES[parsed.data.contentType.toLowerCase()];
    if (!ext) {
      return reply.code(400).send({ error: `Unsupported file type: ${parsed.data.contentType}` });
    }

    // Namespaced and randomised so filenames cannot collide or be guessed.
    const objectKey = `documents/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const presigned = await presignUpload(objectKey, parsed.data.contentType);

    return reply.send({
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      expiresAt: presigned.expiresAt.toISOString(),
    });
  });

  app.post('/', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await prisma.companyDocument.create({
      data: {
        ...parsed.data,
        category: parsed.data.category as DocumentCategory,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        uploadedById: req.auth!.sub,
      },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    return reply.code(201).send({ document: toDto(row) });
  });

  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = CreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.companyDocument.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'document not found' });

    const { category, expiresAt, ...rest } = parsed.data;
    const row = await prisma.companyDocument.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(category !== undefined && { category: category as DocumentCategory }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    return reply.send({ document: toDto(row) });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const existing = await prisma.companyDocument.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'document not found' });
    await prisma.companyDocument.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });
};

/**
 * Shareholders only: the owner, or a user actually linked to a cap-table entry.
 * A role alone never grants this — an admin who is not a shareholder is refused,
 * which is the whole point of the tab.
 */
async function requireShareholder(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.sub },
    select: { isOwner: true, shareholder: { select: { id: true } } },
  });
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  if (!user.isOwner && !user.shareholder) {
    return reply.code(403).send({ error: 'shareholder access required' });
  }
}

type Row = Prisma.CompanyDocumentGetPayload<{ include: { uploadedBy: { select: { fullName: true } } } }>;

function toDto(row: Row): CompanyDocumentDto {
  let daysUntilExpiry: number | null = null;
  if (row.expiresAt) {
    const today = new Date();
    const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    daysUntilExpiry = Math.round((row.expiresAt.getTime() - midnight) / 86_400_000);
  }

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    fileUrl: row.fileUrl,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    isExternal: row.isExternal,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : null,
    daysUntilExpiry,
    uploadedByName: row.uploadedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
