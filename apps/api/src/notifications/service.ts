/**
 * Notification dispatch.
 *
 * Every notification is persisted as a Notification row (the in-app feed —
 * always shown). When the user has the SMS channel enabled we ALSO send a
 * best-effort text via Africa's Talking.
 *
 * Crucially, `notify` never throws: notifications are a side-effect of the
 * booking lifecycle and must never roll back or block the action that
 * triggered them. Call it fire-and-forget.
 */
import { NotificationChannel, Prisma } from '@prisma/client';

import { prisma } from '../db.js';
import { sendSms, type SmsLogger } from '../auth/sms.js';

interface NotifyOpts {
  userId: string;
  kind: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  log: SmsLogger;
  /** Also attempt an SMS if the user has the SMS channel enabled. */
  sms?: boolean;
}

export async function notify(opts: NotifyOpts): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        kind: opts.kind,
        title: opts.title,
        body: opts.body,
        data: opts.data ? (opts.data as Prisma.InputJsonValue) : undefined,
      },
    });

    if (opts.sms) {
      const [user, pref] = await Promise.all([
        prisma.user.findUnique({ where: { id: opts.userId }, select: { phone: true } }),
        prisma.notificationPreference.findUnique({
          where: { userId_channel: { userId: opts.userId, channel: NotificationChannel.SMS } },
        }),
      ]);
      // Default to enabled if the user has no explicit pref row.
      const smsEnabled = pref ? pref.enabled : true;
      if (user?.phone && smsEnabled) {
        await sendSms(user.phone, `${opts.title} — ${opts.body}`, opts.log);
      }
    }
  } catch (err) {
    opts.log.error({ err, userId: opts.userId, kind: opts.kind }, 'notify failed (swallowed)');
  }
}

// ── Lifecycle helpers ───────────────────────────────────────────────────────

export async function notifyBookingConfirmed(bookingId: string, log: SmsLogger): Promise<void> {
  const booking = await safeBooking(bookingId);
  if (!booking) return;
  await notify({
    userId: booking.userId,
    kind: 'BOOKING_CONFIRMED',
    title: 'Booking confirmed',
    body: `${booking.reference} is paid and scheduled for ${formatWhen(booking.scheduledAt)}.`,
    data: { bookingId },
    log,
    sms: true,
  });
}

export async function notifyBookingStatus(bookingId: string, status: string, log: SmsLogger): Promise<void> {
  const booking = await safeBooking(bookingId);
  if (!booking) return;

  const copy = statusCopy(status);
  if (!copy) return;
  await notify({
    userId: booking.userId,
    kind: copy.kind,
    title: copy.title,
    body: copy.body(booking.reference),
    data: { bookingId },
    log,
    sms: status === 'EN_ROUTE' || status === 'COMPLETED',
  });
}

export async function notifyCrewAssigned(bookingId: string, crewUserId: string, log: SmsLogger): Promise<void> {
  const booking = await safeBooking(bookingId);
  if (!booking) return;
  // Notify the crew member they have a new job.
  await notify({
    userId: crewUserId,
    kind: 'CREW_ASSIGNED',
    title: 'New job assigned',
    body: `You're on ${booking.reference} — ${formatWhen(booking.scheduledAt)}.`,
    data: { bookingId },
    log,
  });
}

export async function notifyQuoteResponded(
  quoteRequestId: string,
  status: string,
  quotedAmountCents: number | null,
  log: SmsLogger,
): Promise<void> {
  const q = await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    select: { userId: true, siteType: true },
  });
  if (!q) return;

  const body =
    status === 'QUOTED' && quotedAmountCents != null
      ? `We've quoted KSh ${(quotedAmountCents / 100).toLocaleString()} for "${q.siteType}".`
      : status === 'SITE_VISIT_SCHEDULED'
      ? `We'd like to schedule a site visit for "${q.siteType}".`
      : `Your quote request for "${q.siteType}" was updated.`;

  await notify({
    userId: q.userId,
    kind: 'QUOTE_UPDATED',
    title: 'Quote update',
    body,
    data: { quoteRequestId },
    log,
    sms: status === 'QUOTED',
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function safeBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, reference: true, scheduledAt: true },
  });
}

function statusCopy(status: string): { kind: string; title: string; body: (ref: string) => string } | null {
  switch (status) {
    case 'EN_ROUTE':
      return { kind: 'CREW_EN_ROUTE', title: 'Crew on the way', body: (r) => `Your crew is en route for ${r}.` };
    case 'IN_PROGRESS':
      return { kind: 'CLEAN_STARTED', title: 'Clean started', body: (r) => `Your crew has started ${r}.` };
    case 'COMPLETED':
      return { kind: 'CLEAN_COMPLETED', title: 'Clean complete', body: (r) => `${r} is done — your Hawk Points have been credited.` };
    default:
      return null;
  }
}

function formatWhen(d: Date): string {
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
