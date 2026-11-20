import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db.js';
import { trySendEmail, type EmailLogger } from '../email/service.js';
import { servicesDueTodayEmail } from '../email/templates.js';
import { nairobiHour, nairobiToday } from './schedule.js';
import { visitsBetween } from './visits.js';

/** The morning email goes out from this hour, Nairobi time. */
export const REMINDER_HOUR = 7;
/** How often the server checks whether today's email is due. */
const CHECK_EVERY_MS = 10 * 60_000;

/** Roles that get the morning email, besides the owner. */
const REMINDER_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.COO, UserRole.CLEANING_SUPERVISOR];

type Outcome = 'too-early' | 'already-handled' | 'nothing-due' | 'sent' | 'not-sent';

/**
 * Send today's "services due" email, once per Nairobi day, from REMINDER_HOUR.
 * A ReminderRun row for the day is written first, so a restart or a second
 * server cannot send it twice; if no email gets through, the row is removed
 * and the next check tries again.
 */
export async function sendDueReminders(log: EmailLogger, now: Date = new Date()): Promise<Outcome> {
  if (nairobiHour(now) < REMINDER_HOUR) return 'too-early';
  const today = nairobiToday(now);
  const day = new Date(today);

  if (await prisma.reminderRun.findUnique({ where: { day } })) return 'already-handled';

  const due = (await visitsBetween(today, today)).filter((v) => v.status === 'PLANNED');
  try {
    await prisma.reminderRun.create({ data: { day, visitCount: due.length } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'already-handled';
    throw err;
  }
  if (due.length === 0) return 'nothing-due';

  const recipients = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { not: null },
      OR: [{ isOwner: true }, { role: { in: REMINDER_ROLES } }],
    },
    select: { id: true, email: true },
  });

  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  const message = servicesDueTodayEmail({
    dateLabel,
    services: due.map((v) => ({
      projectTitle: v.projectTitle,
      clientName: v.clientName,
      siteLocation: v.siteLocation,
      isDeepClean: v.isDeepClean,
    })),
  });

  let sent = 0;
  for (const r of recipients) {
    if (await trySendEmail(r.email!, message, log, { staffId: r.id, reminderDay: today })) sent += 1;
  }
  if (sent === 0 && recipients.length > 0) {
    await prisma.reminderRun.delete({ where: { day } }).catch(() => undefined);
    return 'not-sent';
  }
  log.info({ reminderDay: today, services: due.length, recipients: sent }, 'Services-due email sent');
  return 'sent';
}

/**
 * Check every few minutes whether today's email is due. Runs inside the API, so
 * it needs no separate scheduled job; the timer does not keep the process alive.
 */
export function startReminderLoop(log: EmailLogger): () => void {
  const tick = () => {
    sendDueReminders(log).catch((err) => log.error({ err }, 'Services-due check failed'));
  };
  const first = setTimeout(tick, 30_000);
  const every = setInterval(tick, CHECK_EVERY_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
