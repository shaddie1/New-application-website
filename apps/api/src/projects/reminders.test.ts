import { beforeEach, describe, expect, it, vi } from 'vitest';

// The morning email: from 07:00 Nairobi time, once a day. The services due go
// to the owner, admins, the COO and cleaning supervisors; invoices sent and
// not paid by their due date go to the owner and the money roles.

const runFindUnique = vi.fn();
const runCreate = vi.fn();
const runDelete = vi.fn();
const userFindMany = vi.fn();
const invoiceFindMany = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    reminderRun: { findUnique: runFindUnique, create: runCreate, delete: runDelete },
    user: { findMany: userFindMany },
    invoice: { findMany: invoiceFindMany },
  },
}));

const visitsBetween = vi.fn();
vi.mock('./visits.js', () => ({ visitsBetween }));

const trySendEmail = vi.fn();
vi.mock('../email/service.js', () => ({ trySendEmail }));

const { sendDueReminders } = await import('./reminders.js');

const log = { info: vi.fn(), error: vi.fn() };
const at = (nairobi: string) => new Date(`${nairobi}+03:00`);
const visit = (title: string, status = 'PLANNED', isDeepClean = false) => ({
  projectId: title, projectTitle: title, clientName: 'Amani', siteLocation: 'Westlands',
  date: '2026-11-21', isDeepClean, status, note: null, markedByName: null,
});
const OWNER = { id: 'u1', email: 'owner@onyxhawk.test', isOwner: true, role: 'ADMIN' };
const COO = { id: 'u2', email: 'coo@onyxhawk.test', isOwner: false, role: 'COO' };
const SUPERVISOR = { id: 'u3', email: 'supervisor@onyxhawk.test', isOwner: false, role: 'CLEANING_SUPERVISOR' };
const FINANCE = { id: 'u4', email: 'finance@onyxhawk.test', isOwner: false, role: 'FINANCIAL_MANAGER' };
const OVERDUE = {
  number: 'OH-2026-0003', totalCents: 2_050_000, dueOn: new Date('2026-11-18'),
  project: { title: 'Office contract', clientName: 'Amani Ltd' },
};
const sentTo = (email: string) => trySendEmail.mock.calls.find((c) => c[0] === email)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  runFindUnique.mockResolvedValue(null);
  runCreate.mockResolvedValue({});
  runDelete.mockResolvedValue({});
  userFindMany.mockResolvedValue([OWNER, COO]);
  invoiceFindMany.mockResolvedValue([]);
  trySendEmail.mockResolvedValue(true);
  visitsBetween.mockResolvedValue([visit('Office contract'), visit('Clinic', 'PLANNED', true), visit('Flat', 'SKIPPED')]);
});

describe('sendDueReminders', () => {
  it('waits until 07:00 in Nairobi', async () => {
    expect(await sendDueReminders(log, at('2026-11-21T06:59:00'))).toBe('too-early');
    expect(visitsBetween).not.toHaveBeenCalled();
  });

  it('emails each recipient the planned services, once for the day', async () => {
    expect(await sendDueReminders(log, at('2026-11-21T07:05:00'))).toBe('sent');
    expect(visitsBetween).toHaveBeenCalledWith('2026-11-21', '2026-11-21');
    expect(runCreate).toHaveBeenCalledWith({ data: { day: new Date('2026-11-21'), visitCount: 2 } });
    expect(trySendEmail).toHaveBeenCalledTimes(2);
    const message = trySendEmail.mock.calls[0]![1];
    expect(message.template).toBe('services-due-today');
    expect(message.subject).toBe('Today: 2 services due (Saturday 21 November)');
    expect(message.text).toContain('- Office contract · Amani · Westlands');
    expect(message.text).toContain('- Clinic (deep clean) · Amani · Westlands');
    expect(message.text).not.toContain('Flat');

    const where = userFindMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual([{ isOwner: true }, { role: { in: ['ADMIN', 'COO', 'CLEANING_SUPERVISOR', 'FINANCIAL_MANAGER'] } }]);
    expect(where.deletedAt).toBeNull();
  });

  it('adds the overdue invoices for the money roles only', async () => {
    userFindMany.mockResolvedValue([OWNER, SUPERVISOR, FINANCE]);
    invoiceFindMany.mockResolvedValue([OVERDUE]);
    expect(await sendDueReminders(log, at('2026-11-21T07:00:00'))).toBe('sent');
    expect(invoiceFindMany.mock.calls[0]![0].where).toEqual({ status: 'SENT', dueOn: { lt: new Date('2026-11-21') } });

    const owner = sentTo(OWNER.email);
    expect(owner.subject).toBe('Today: 2 services due, 1 invoice overdue (Saturday 21 November)');
    expect(owner.text).toContain('- OH-2026-0003, KSh 20,500 · Office contract · Amani Ltd · 3 days late');
    expect(sentTo(SUPERVISOR.email).text).not.toContain('OH-2026-0003');
    // The financial manager gets only the invoices.
    const finance = sentTo(FINANCE.email);
    expect(finance.subject).toBe('Today: 1 invoice overdue (Saturday 21 November)');
    expect(finance.text).not.toContain('Office contract · Amani · Westlands');
  });

  it('sends the overdue invoices on a day with no services', async () => {
    userFindMany.mockResolvedValue([SUPERVISOR, FINANCE]);
    visitsBetween.mockResolvedValue([]);
    invoiceFindMany.mockResolvedValue([OVERDUE]);
    expect(await sendDueReminders(log, at('2026-11-21T07:00:00'))).toBe('sent');
    expect(trySendEmail).toHaveBeenCalledTimes(1);
    expect(sentTo(FINANCE.email).subject).toBe('Today: 1 invoice overdue (Saturday 21 November)');
  });

  it('does nothing when the day was already handled', async () => {
    runFindUnique.mockResolvedValue({ day: new Date('2026-11-21') });
    expect(await sendDueReminders(log, at('2026-11-21T09:00:00'))).toBe('already-handled');
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('records a day with nothing due without emailing', async () => {
    visitsBetween.mockResolvedValue([visit('Flat', 'DONE')]);
    expect(await sendDueReminders(log, at('2026-11-21T07:00:00'))).toBe('nothing-due');
    expect(runCreate).toHaveBeenCalledWith({ data: { day: new Date('2026-11-21'), visitCount: 0 } });
    expect(trySendEmail).not.toHaveBeenCalled();
  });

  it('tries again later when no email got through', async () => {
    trySendEmail.mockResolvedValue(false);
    expect(await sendDueReminders(log, at('2026-11-21T07:00:00'))).toBe('not-sent');
    expect(runDelete).toHaveBeenCalledWith({ where: { day: new Date('2026-11-21') } });
  });
});
