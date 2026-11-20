import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db.js';
import { trySendEmail, type EmailLogger } from '../email/service.js';
import { servicesDueTodayEmail, type EmailMessage, type OverdueInvoice } from '../email/templates.js';
import { shillings } from '../invoices/invoices.js';
import { nairobiHour, nairobiToday } from './schedule.js';
import { visitsBetween } from './visits.js';

/** The morning email goes out from this hour, Nairobi time. */
export const REMINDER_HOUR = 7;
/** How often the server checks whether today's email is due. */
const CHECK_EVERY_MS = 10 * 60_000;

/** Roles told about the services due, besides the owner. */
const SERVICE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.COO, UserRole.CLEANING_SUPERVISOR];
/** Roles told about overdue invoices, besides the owner: the project money roles. */
const MONEY_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.COO, UserRole.FINANCIAL_MANAGER];

type Outcome = 'too-early' | 'already-handled' | 'nothing-due' | 'sent' | 'not-sent';

/** Invoices sent and still not paid after their due date, the longest overdue first. */
async function overdueInvoices(today: string): Promise<OverdueInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { status: 'SENT', dueOn: { lt: new Date(today) } },
    select: { number: true, totalCents: true, dueOn: true, project: { select: { title: true, clientName: true } } },
    orderBy: { dueOn: 'asc' },
  });
  const todayMs = new Date(today).getTime();
  return rows.map((r) => ({
    number: r.number,
    projectTitle: r.project.title,
    clientName: r.project.clientName,
    amount: shillings(r.totalCents),
    daysLate: Math.round((todayMs - r.dueOn!.getTime()) / 86_400_000),
  }));
}

/**
 * Send today's morning email, once per Nairobi day, from REMINDER_HOUR: the
 * services due today, and for the money roles the overdue invoices. A
 * ReminderRun row for the day is written first, so a restart or a second
 * server cannot send it twice; if no email gets through, the row is removed
 * and the next check tries again.
 */
export async function sendDueReminders(log: EmailLogger, now: Date = new Date()): Promise<Outcome> {
  if (nairobiHour(now) < REMINDER_HOUR) return 'too-early';
  const today = nairobiToday(now);
  const day = new Date(today);

  if (await prisma.reminderRun.findUnique({ where: { day } })) return 'already-handled';

  const [visits, overdue] = await Promise.all([visitsBetween(today, today), overdueInvoices(today)]);
  const due = visits.filter((v) => v.status === 'PLANNED');
  try {
    await prisma.reminderRun.create({ data: { day, visitCount: due.length } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'already-handled';
    throw err;
  }
  if (due.length === 0 && overdue.length === 0) return 'nothing-due';

  const recipients = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { not: null },
      OR: [{ isOwner: true }, { role: { in: [...new Set([...SERVICE_ROLES, ...MONEY_ROLES])] } }],
    },
    select: { id: true, email: true, isOwner: true, role: true },
  });

  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  const services = due.map((v) => ({
    projectTitle: v.projectTitle,
    clientName: v.clientName,
    siteLocation: v.siteLocation,
    isDeepClean: v.isDeepClean,
  }));
  // Each recipient gets the lists that are theirs: at most four different emails.
  const messages = new Map<string, EmailMessage>();
  const messageFor = (r: (typeof recipients)[number]): EmailMessage | null => {
    const theirServices = r.isOwner || SERVICE_ROLES.includes(r.role) ? services : [];
    const theirOverdue = r.isOwner || MONEY_ROLES.includes(r.role) ? overdue : [];
    if (theirServices.length === 0 && theirOverdue.length === 0) return null;
    const key = `${theirServices.length > 0}-${theirOverdue.length > 0}`;
    if (!messages.has(key)) {
      messages.set(key, servicesDueTodayEmail({ dateLabel, services: theirServices, overdue: theirOverdue }));
    }
    return messages.get(key)!;
  };

  let sent = 0;
  let tried = 0;
  for (const r of recipients) {
    const message = messageFor(r);
    if (!message) continue;
    tried += 1;
    if (await trySendEmail(r.email!, message, log, { staffId: r.id, reminderDay: today })) sent += 1;
  }
  if (sent === 0 && tried > 0) {
    await prisma.reminderRun.delete({ where: { day } }).catch(() => undefined);
    return 'not-sent';
  }
  log.info({ reminderDay: today, services: due.length, overdueInvoices: overdue.length, recipients: sent }, 'Morning email sent');
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
