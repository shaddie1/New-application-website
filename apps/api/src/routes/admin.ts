import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BookingStatus,
  CrewRole,
  Prisma,
  QuoteStatus,
  UserRole,
} from '@prisma/client';
import type {
  AddressDto,
  AdminBookingDto,
  AdminQuoteRequestDto,
  AdminStats,
  CleanTypeCode,
  CrewUserDto,
  QuoteFrequency,
  QuoteStatus as QuoteStatusDto,
  ServiceLineCode,
  BookingStatus as BookingStatusDto,
  RespondQuoteInput,
  AssignCrewInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { notifyCrewAssigned, notifyQuoteResponded } from '../notifications/service.js';

const BookingsQuerySchema = z.object({
  status: z
    .enum([
      'DRAFT',
      'PENDING_PAYMENT',
      'CONFIRMED',
      'EN_ROUTE',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ])
    .optional(),
});

const AssignSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['LEAD', 'MEMBER']),
}) satisfies z.ZodType<AssignCrewInput>;

const RespondSchema = z.object({
  status: z.enum(['PENDING', 'SITE_VISIT_SCHEDULED', 'QUOTED', 'WON', 'LOST', 'CANCELLED']),
  quotedAmountCents: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<RespondQuoteInput>;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireAdminRole);

  // Dashboard counts.
  app.get('/stats', async (_req, reply) => {
    const [pendingPayment, confirmed, inProgress, pendingQuotes] = await Promise.all([
      prisma.booking.count({ where: { status: BookingStatus.PENDING_PAYMENT } }),
      prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
      prisma.booking.count({ where: { status: { in: [BookingStatus.EN_ROUTE, BookingStatus.IN_PROGRESS] } } }),
      prisma.quoteRequest.count({ where: { status: QuoteStatus.PENDING } }),
    ]);
    const stats: AdminStats = { pendingPayment, confirmed, inProgress, pendingQuotes };
    return reply.send({ stats });
  });

  // All bookings (optionally filtered by status), newest scheduled first.
  app.get('/bookings', async (req, reply) => {
    const parsed = BookingsQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const rows = await prisma.booking.findMany({
      where: parsed.data.status ? { status: parsed.data.status as BookingStatus } : undefined,
      orderBy: { scheduledAt: 'desc' },
      take: 200,
      include: adminBookingInclude,
    });
    const bookings: AdminBookingDto[] = rows.map(toAdminBookingDto);
    return reply.send({ bookings });
  });

  // Assign (or re-assign) a crew member to a booking.
  app.post<{ Params: { id: string } }>('/bookings/:id/assign', async (req, reply) => {
    const parsed = AssignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) return reply.code(404).send({ error: 'booking not found' });

    const crewUser = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!crewUser || (crewUser.role !== UserRole.CREW && crewUser.role !== UserRole.CREW_LEAD)) {
      return reply.code(400).send({ error: 'user is not a crew member' });
    }

    // Only one LEAD per booking — clear any other lead first.
    if (parsed.data.role === 'LEAD') {
      await prisma.bookingCrew.updateMany({
        where: { bookingId: booking.id, role: CrewRole.LEAD, userId: { not: parsed.data.userId } },
        data: { role: CrewRole.MEMBER },
      });
    }

    await prisma.bookingCrew.upsert({
      where: { bookingId_userId: { bookingId: booking.id, userId: parsed.data.userId } },
      create: { bookingId: booking.id, userId: parsed.data.userId, role: parsed.data.role as CrewRole },
      update: { role: parsed.data.role as CrewRole },
    });

    void notifyCrewAssigned(booking.id, parsed.data.userId, req.log);

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: adminBookingInclude,
    });
    return reply.send({ booking: toAdminBookingDto(updated) });
  });

  // Remove a crew assignment.
  app.delete<{ Params: { id: string; userId: string } }>('/bookings/:id/crew/:userId', async (req, reply) => {
    await prisma.bookingCrew.deleteMany({
      where: { bookingId: req.params.id, userId: req.params.userId },
    });
    const updated = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: adminBookingInclude,
    });
    if (!updated) return reply.code(404).send({ error: 'booking not found' });
    return reply.send({ booking: toAdminBookingDto(updated) });
  });

  // Crew users for the assignment picker.
  app.get('/crew', async (_req, reply) => {
    const rows = await prisma.user.findMany({
      where: { role: { in: [UserRole.CREW, UserRole.CREW_LEAD] }, deletedAt: null },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, phone: true, role: true },
    });
    const crew: CrewUserDto[] = rows.map((u) => ({ id: u.id, fullName: u.fullName, phone: u.phone, role: u.role }));
    return reply.send({ crew });
  });

  // All quote requests (optionally by status).
  app.get('/quote-requests', async (req, reply) => {
    const status = typeof (req.query as { status?: string }).status === 'string'
      ? (req.query as { status?: string }).status
      : undefined;
    const rows = await prisma.quoteRequest.findMany({
      where: status ? { status: status as QuoteStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { serviceLine: true, user: { select: { fullName: true, phone: true } } },
    });
    const quoteRequests = rows.map(toAdminQuoteDto);
    return reply.send({ quoteRequests });
  });

  // Respond to a quote request — set status and (when QUOTED) a price.
  app.post<{ Params: { id: string } }>('/quote-requests/:id/respond', async (req, reply) => {
    const parsed = RespondSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: 'quote request not found' });

    if (parsed.data.status === 'QUOTED' && parsed.data.quotedAmountCents == null) {
      return reply.code(400).send({ error: 'quotedAmountCents is required when status is QUOTED' });
    }

    const row = await prisma.quoteRequest.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status as QuoteStatus,
        quotedAmountCents: parsed.data.quotedAmountCents ?? (parsed.data.status === 'QUOTED' ? undefined : existing.quotedAmountCents),
        quotedAt: parsed.data.status === 'QUOTED' ? new Date() : existing.quotedAt,
      },
      include: { serviceLine: true, user: { select: { fullName: true, phone: true } } },
    });

    void notifyQuoteResponded(row.id, parsed.data.status, row.quotedAmountCents, req.log);

    return reply.send({ quoteRequest: toAdminQuoteDto(row) });
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function requireAdminRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (req.auth.role !== UserRole.ADMIN && req.auth.role !== UserRole.SUPPORT) {
    return reply.code(403).send({ error: 'admin access required' });
  }
}

const adminBookingInclude = {
  user: { select: { fullName: true, phone: true } },
  address: true,
  serviceLine: true,
  cleanType: true,
  addOns: { include: { addOn: true } },
  crew: { include: { user: { select: { fullName: true } } } },
} satisfies Prisma.BookingInclude;

type AdminBookingRow = Prisma.BookingGetPayload<{ include: typeof adminBookingInclude }>;

function toAdminBookingDto(b: AdminBookingRow): AdminBookingDto {
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
    crew: b.crew.map((c) => ({ userId: c.userId, name: c.user.fullName, role: c.role as 'LEAD' | 'MEMBER' })),
  };
}

function toAddressDto(a: AdminBookingRow['address']): AddressDto {
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

type AdminQuoteRow = Prisma.QuoteRequestGetPayload<{
  include: { serviceLine: true; user: { select: { fullName: true; phone: true } } };
}>;

function toAdminQuoteDto(row: AdminQuoteRow): AdminQuoteRequestDto {
  return {
    id: row.id,
    serviceLineCode: row.serviceLine.code as ServiceLineCode,
    serviceLineName: row.serviceLine.name,
    siteType: row.siteType,
    approxSqm: row.approxSqm,
    floors: row.floors,
    frequency: row.frequency as QuoteFrequency,
    notes: row.notes,
    status: row.status as QuoteStatusDto,
    quotedAmountCents: row.quotedAmountCents,
    quotedAt: row.quotedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    customerName: row.user.fullName,
    customerPhone: row.user.phone,
  };
}
