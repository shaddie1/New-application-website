import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BookingStatus,
  CrewRole,
  Prisma,
  UserRole,
} from '@prisma/client';
import type {
  CrewJobDto,
  CrewTransitionTo,
  TransitionBookingInput,
  AddressDto,
  BookingStatus as BookingStatusDto,
  CleanTypeCode,
  ServiceLineCode,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { transitionBooking, TransitionError } from '../booking/transitions.js';
import { requestUploadUrl, savePhoto, listBookingPhotos, PhotoError } from '../photos/service.js';
import { StorageNotConfiguredError } from '../storage/r2.js';

const TransitionSchema = z.object({
  to: z.enum(['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED']),
}) satisfies z.ZodType<TransitionBookingInput>;

const ListQuerySchema = z.object({
  scope: z.enum(['today', 'upcoming', 'past', 'all']).default('upcoming'),
});

const ClaimSchema = z.object({
  bookingId: z.string().min(1),
  role: z.enum(['LEAD', 'MEMBER']).default('LEAD'),
});

const UploadUrlSchema = z.object({
  room: z.string().trim().min(1).max(60),
  kind: z.enum(['BEFORE', 'AFTER']),
  contentType: z.string().trim().min(1).max(60),
});

const CreatePhotoSchema = z.object({
  room: z.string().trim().min(1).max(60),
  kind: z.enum(['BEFORE', 'AFTER']),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
});

export const crewRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireCrewRole);

  app.get('/jobs', async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    const where = buildJobsWhere(userId, parsed.data.scope);

    const rows = await prisma.bookingCrew.findMany({
      where,
      include: {
        booking: {
          include: jobInclude,
        },
      },
      orderBy: { booking: { scheduledAt: 'asc' } },
    });

    const jobs: CrewJobDto[] = rows.map((row) => toCrewJobDto(row));
    return reply.send({ jobs });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const userId = req.auth!.sub;
    const assignment = await prisma.bookingCrew.findUnique({
      where: { bookingId_userId: { bookingId: req.params.id, userId } },
      include: { booking: { include: jobInclude } },
    });
    if (!assignment) return reply.code(404).send({ error: 'job not found' });
    return reply.send({ job: toCrewJobDto(assignment) });
  });

  app.post<{ Params: { id: string } }>('/jobs/:id/transition', async (req, reply) => {
    const parsed = TransitionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const result = await transitionBooking({
        bookingId: req.params.id,
        callerUserId: req.auth!.sub,
        to: parsed.data.to as CrewTransitionTo,
        log: req.log,
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof TransitionError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // ── Photos ────────────────────────────────────────────────────────────
  // Presign a direct-to-R2 upload. Caller must be assigned to the booking.
  app.post<{ Params: { id: string } }>('/jobs/:id/photos/upload-url', async (req, reply) => {
    const parsed = UploadUrlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const assigned = await isAssigned(req.params.id, req.auth!.sub);
    if (!assigned) return reply.code(404).send({ error: 'job not found' });

    try {
      const presigned = await requestUploadUrl({
        bookingId: req.params.id,
        room: parsed.data.room,
        kind: parsed.data.kind,
        contentType: parsed.data.contentType,
      });
      return reply.send({
        uploadUrl: presigned.uploadUrl,
        publicUrl: presigned.publicUrl,
        objectKey: presigned.objectKey,
        expiresAt: presigned.expiresAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        return reply.code(503).send({ error: 'photo uploads are not available yet (storage not configured)' });
      }
      if (err instanceof PhotoError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // Confirm an uploaded object → create the BookingPhoto row.
  app.post<{ Params: { id: string } }>('/jobs/:id/photos', async (req, reply) => {
    const parsed = CreatePhotoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const assigned = await isAssigned(req.params.id, req.auth!.sub);
    if (!assigned) return reply.code(404).send({ error: 'job not found' });

    const photo = await savePhoto({
      bookingId: req.params.id,
      room: parsed.data.room,
      kind: parsed.data.kind,
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnailUrl,
      takenByUserId: req.auth!.sub,
    });
    return reply.code(201).send({ photo });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/photos', async (req, reply) => {
    const assigned = await isAssigned(req.params.id, req.auth!.sub);
    if (!assigned) return reply.code(404).send({ error: 'job not found' });
    const result = await listBookingPhotos(req.params.id);
    return reply.send(result);
  });

  // Dev shortcut: a crew user claims themselves onto a booking. Real
  // assignments will come from the admin tooling once it exists. We only
  // refuse if there's already a LEAD on this booking (you can have many
  // MEMBERS, only one LEAD).
  app.post('/jobs/claim', async (req, reply) => {
    const parsed = ClaimSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = req.auth!.sub;
    const booking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId } });
    if (!booking) return reply.code(404).send({ error: 'booking not found' });
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) {
      return reply.code(409).send({ error: `cannot claim a ${booking.status} booking` });
    }

    if (parsed.data.role === 'LEAD') {
      const existingLead = await prisma.bookingCrew.findFirst({
        where: { bookingId: booking.id, role: CrewRole.LEAD, userId: { not: userId } },
      });
      if (existingLead) return reply.code(409).send({ error: 'this job already has a lead' });
    }

    const assignment = await prisma.bookingCrew.upsert({
      where: { bookingId_userId: { bookingId: booking.id, userId } },
      create: { bookingId: booking.id, userId, role: parsed.data.role as CrewRole },
      update: { role: parsed.data.role as CrewRole },
      include: { booking: { include: jobInclude } },
    });
    return reply.code(201).send({ job: toCrewJobDto(assignment) });
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function isAssigned(bookingId: string, userId: string): Promise<boolean> {
  const row = await prisma.bookingCrew.findUnique({
    where: { bookingId_userId: { bookingId, userId } },
    select: { id: true },
  });
  return Boolean(row);
}

async function requireCrewRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  if (req.auth.role !== UserRole.CREW && req.auth.role !== UserRole.CREW_LEAD) {
    return reply.code(403).send({ error: 'not a crew user' });
  }
}

const jobInclude = {
  user: { select: { fullName: true, phone: true } },
  address: true,
  serviceLine: true,
  cleanType: true,
  addOns: { include: { addOn: true } },
} satisfies Prisma.BookingInclude;

type JobRow = Prisma.BookingCrewGetPayload<{
  include: { booking: { include: typeof jobInclude } };
}>;
type AddressRow = JobRow['booking']['address'];

function toCrewJobDto(row: JobRow): CrewJobDto {
  const b = row.booking;
  return {
    id: b.id,
    reference: b.reference,
    status: b.status as BookingStatusDto,
    serviceLineCode: b.serviceLine.code as ServiceLineCode,
    cleanTypeCode: b.cleanType.code as CleanTypeCode,
    scope: {
      bedrooms: b.bedrooms,
      bathrooms: b.bathrooms,
      livingRooms: b.livingRooms,
      squareMeters: b.squareMeters,
    },
    scheduledAt: b.scheduledAt.toISOString(),
    estimatedDurationMinutes: b.estimatedDurationMinutes,
    basePriceCents: b.basePriceCents,
    addOnsTotalCents: b.addOnsTotalCents,
    travelFeeCents: b.travelFeeCents,
    creditAppliedCents: b.creditAppliedCents,
    discountCents: b.discountCents,
    totalCents: b.totalCents,
    pointsToEarn: b.pointsToEarn,
    notesForCrew: b.notesForCrew,
    address: toAddressDto(b.address),
    addOns: b.addOns.map((ba) => ({
      id: ba.addOn.id,
      code: ba.addOn.code,
      name: ba.addOn.name,
      priceCentsAtBooking: ba.priceCentsAtBooking,
    })),
    createdAt: b.createdAt.toISOString(),
    customerName: b.user.fullName,
    customerPhone: b.user.phone,
    crewRole: row.role as 'LEAD' | 'MEMBER',
  };
}

function toAddressDto(a: AddressRow): AddressDto {
  return {
    id: a.id,
    label: a.label,
    line1: a.line1,
    line2: a.line2,
    area: a.area,
    city: a.city,
    country: a.country,
    lat: a.lat ? Number(a.lat) : null,
    lng: a.lng ? Number(a.lng) : null,
    accessNotes: a.accessNotes,
    isDefault: a.isDefault,
  };
}

function buildJobsWhere(userId: string, scope: 'today' | 'upcoming' | 'past' | 'all'): Prisma.BookingCrewWhereInput {
  const now = new Date();

  if (scope === 'all') return { userId };

  const todayStart = nairobiDayStartUtc(now);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  if (scope === 'today') {
    return { userId, booking: { scheduledAt: { gte: todayStart, lt: todayEnd } } };
  }
  if (scope === 'upcoming') {
    return {
      userId,
      booking: {
        scheduledAt: { gte: todayStart },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.COMPLETED] },
      },
    };
  }
  // past
  return {
    userId,
    booking: {
      OR: [
        { status: BookingStatus.COMPLETED },
        { status: BookingStatus.CANCELLED },
        { status: BookingStatus.NO_SHOW },
        { scheduledAt: { lt: todayStart } },
      ],
    },
  };
}

/** UTC moment that corresponds to 00:00 in Africa/Nairobi today. */
function nairobiDayStartUtc(now: Date): Date {
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`invalid nairobi date: ${iso}`);
  // Africa/Nairobi is UTC+3 (no DST) → 00:00 there = 21:00 prev day UTC.
  return new Date(Date.UTC(y, m - 1, d, -3, 0, 0));
}
