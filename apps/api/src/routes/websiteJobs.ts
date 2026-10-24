import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ClientSegment, type Prisma } from '@prisma/client';
import type {
  PublicWebsiteJobDto,
  PublicWebsiteJobsResult,
  SaveWebsiteJobInput,
  WebsiteJobDto,
  WebsiteJobMutationResult,
  WebsiteJobPhotoUploadUrlInput,
  WebsiteJobPhotoUploadUrlResult,
  WebsiteJobsResult,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { requireWebsiteAccess } from '../auth/roles.js';
import { deleteObject, isConfigured, presignUpload, publicUrlFor } from '../storage/r2.js';
import { requestSiteRebuild } from '../website/deployHook.js';

/**
 * A photo as the upload-url route issued it: an object key, never a URL, and
 * only under website-jobs/. Dots and slashes are refused after the prefix, so
 * a key like `website-jobs/../documents/x` cannot reach the rest of the bucket.
 */
const PhotoKey = z.string().regex(/^website-jobs\/[\w-]+\.jpg$/, 'must be a key from the upload-url route');

/** Every field is required, so any saved job can be published. */
const SaveSchema = z.object({
  serviceLineCode: z.string().trim().min(1).max(50),
  clientSegment: z.nativeEnum(ClientSegment),
  area: z.string().trim().min(1).max(60),
  completedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine((d) => d <= nairobiToday(), 'cannot be later than today'),
  description: z.string().trim().min(1).max(280),
  photoKeys: z.array(PhotoKey).min(1).max(8),
}) satisfies z.ZodType<SaveWebsiteJobInput>;

// Admin re-encodes every photo to JPEG before upload, so nothing else is presigned.
const UploadUrlSchema = z.object({
  contentType: z.literal('image/jpeg'),
}) satisfies z.ZodType<WebsiteJobPhotoUploadUrlInput>;

const jobInclude = {
  photos: { orderBy: { sortOrder: 'asc' } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.WebsiteJobInclude;

// ── Admin ───────────────────────────────────────────────────────────────────

export const websiteJobRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireWebsiteAccess);

  app.get('/', async (_req, reply) => {
    const rows = await prisma.websiteJob.findMany({
      include: jobInclude,
      orderBy: [{ completedOn: 'desc' }, { createdAt: 'desc' }],
    });
    return reply.send({ jobs: rows.map(toDto), uploadEnabled: isConfigured() } satisfies WebsiteJobsResult);
  });

  /**
   * Presigned PUT so the browser uploads a photo straight to object storage.
   * Returns 503 when storage is not configured.
   */
  app.post('/upload-url', async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(503).send({ error: 'Photo storage is not configured.' });
    }

    const parsed = UploadUrlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Random so a photo of an unpublished job cannot be found by guessing.
    const presigned = await presignUpload(`website-jobs/${randomUUID()}.jpg`, parsed.data.contentType);
    return reply.send({
      uploadUrl: presigned.uploadUrl,
      objectKey: presigned.objectKey,
      publicUrl: presigned.publicUrl,
      expiresAt: presigned.expiresAt.toISOString(),
    } satisfies WebsiteJobPhotoUploadUrlResult);
  });

  app.post('/', async (req, reply) => {
    const parsed = SaveSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { photoKeys, completedOn, ...fields } = parsed.data;
    const row = await prisma.websiteJob.create({
      data: {
        ...fields,
        completedOn: new Date(completedOn),
        createdById: req.auth!.sub,
        photos: { create: toPhotoRows(photoKeys) },
      },
      include: jobInclude,
    });
    // New jobs start unpublished, so the live site has nothing to rebuild.
    return reply.code(201).send({ job: toDto(row), siteUpdate: null } satisfies WebsiteJobMutationResult);
  });

  app.put<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const parsed = SaveSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.websiteJob.findUnique({ where: { id: req.params.id }, include: { photos: true } });
    if (!existing) return reply.code(404).send({ error: 'website job not found' });

    // One nested write, which Prisma runs as a single transaction: the fields
    // and the whole ordered photo list are replaced together.
    const { photoKeys, completedOn, ...fields } = parsed.data;
    const row = await prisma.websiteJob.update({
      where: { id: req.params.id },
      data: {
        ...fields,
        completedOn: new Date(completedOn),
        photos: { deleteMany: {}, create: toPhotoRows(photoKeys) },
      },
      include: jobInclude,
    });

    // A photo dropped in the edit (say, one showing too much) is deleted from
    // storage so its URL stops serving it. The save stands either way.
    const kept = new Set(photoKeys);
    const dropped = existing.photos.filter((p) => !kept.has(p.objectKey));
    await Promise.all(
      dropped.map((p) =>
        deleteObject(p.objectKey).catch((err) => {
          req.log.error({ err, objectKey: p.objectKey }, 'could not delete a dropped website job photo');
        }),
      ),
    );

    const siteUpdate = row.publishedAt ? await requestSiteRebuild(req.log) : null;
    return reply.send({ job: toDto(row), siteUpdate } satisfies WebsiteJobMutationResult);
  });

  app.post<{ Params: { id: string } }>('/:id/publish', (req, reply) => setPublishedAt(req, reply, new Date()));
  app.post<{ Params: { id: string } }>('/:id/unpublish', (req, reply) => setPublishedAt(req, reply, null));
};

/** Publish (a date) or unpublish (null) a job, then ask for the site rebuild. */
async function setPublishedAt(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  publishedAt: Date | null,
) {
  const existing = await prisma.websiteJob.findUnique({ where: { id: req.params.id } });
  if (!existing) return reply.code(404).send({ error: 'website job not found' });

  const row = await prisma.websiteJob.update({
    where: { id: req.params.id },
    data: { publishedAt },
    include: jobInclude,
  });
  const siteUpdate = await requestSiteRebuild(req.log);
  return reply.send({ job: toDto(row), siteUpdate } satisfies WebsiteJobMutationResult);
}

// ── Public ──────────────────────────────────────────────────────────────────

/**
 * Published jobs for the public website, which fetches them at build time.
 * No auth: rows go out through toPublicDto, so staff ids, object keys and
 * unpublished jobs never leave the API.
 */
export const publicWebsiteJobRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    const rows = await prisma.websiteJob.findMany({
      where: { publishedAt: { not: null } },
      include: { photos: { orderBy: { sortOrder: 'asc' } } },
      // Newest work first; jobs finished the same day by latest publish.
      orderBy: [{ completedOn: 'desc' }, { publishedAt: 'desc' }],
    });

    // Names come from the catalog; a code no longer in it gets none.
    const lines = await prisma.serviceLine.findMany({
      where: { code: { in: [...new Set(rows.map((r) => r.serviceLineCode))] } },
      select: { code: true, name: true },
    });
    const names = new Map(lines.map((l) => [l.code, l.name]));

    return reply.send({
      jobs: rows.map((r) => toPublicDto(r, names.get(r.serviceLineCode) ?? null)),
    } satisfies PublicWebsiteJobsResult);
  });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Today on the Nairobi calendar, where staff record their jobs. */
function nairobiToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
}

function toPhotoRows(photoKeys: string[]) {
  return photoKeys.map((objectKey, sortOrder) => ({ objectKey, url: publicUrlFor(objectKey), sortOrder }));
}

type JobRow = Prisma.WebsiteJobGetPayload<{ include: typeof jobInclude }>;
type PublicJobRow = Prisma.WebsiteJobGetPayload<{ include: { photos: true } }>;

function toDto(row: JobRow): WebsiteJobDto {
  return {
    id: row.id,
    serviceLineCode: row.serviceLineCode,
    clientSegment: row.clientSegment,
    area: row.area,
    completedOn: row.completedOn.toISOString().slice(0, 10),
    description: row.description,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    photos: row.photos.map((p) => ({ objectKey: p.objectKey, url: p.url })),
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicDto(row: PublicJobRow, serviceName: string | null): PublicWebsiteJobDto {
  return {
    id: row.id,
    serviceLineCode: row.serviceLineCode,
    serviceName,
    clientSegment: row.clientSegment,
    area: row.area,
    completedOn: row.completedOn.toISOString().slice(0, 10),
    description: row.description,
    photos: row.photos.map((p) => ({ url: p.url })),
  };
}
