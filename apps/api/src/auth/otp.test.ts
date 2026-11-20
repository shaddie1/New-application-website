import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A sign-in code is readable in two places outside the message that carries
// it: the `devOtp` field of the sign-in answer, and the `codePlain` column the
// Dashboard's dev panel reads. Both exist for development only.

const otpFindFirst = vi.fn();
const otpUpdateMany = vi.fn();
const otpCreate = vi.fn();
const otpCount = vi.fn();
const otpAggregate = vi.fn();
vi.mock('../db.js', () => ({
  prisma: {
    otpCode: { findFirst: otpFindFirst, updateMany: otpUpdateMany, create: otpCreate, count: otpCount, aggregate: otpAggregate },
  },
}));

const sendSms = vi.fn();
vi.mock('./sms.js', () => ({ sendSms }));

const sendEmail = vi.fn();
vi.mock('../email/service.js', () => ({ sendEmail }));
vi.mock('../email/format.js', () => ({ maskEmail: () => 'j***@onyxhawk.co.ke' }));
vi.mock('../email/templates.js', () => ({
  adminSignInCodeEmail: ({ code }: { code: string }) => ({ subject: 'Your code', text: code }),
}));

const { env } = await import('../env.js');
const { devToolsEnabled, issueAdminSignInOtp, issueSignInOtp, verifyAdminSignInOtp, verifySignInOtp } = await import('./otp.js');
const { sha256 } = await import('./hash.js');

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
const staff = { phone: '+254712480392', email: 'jane@onyxhawk.co.ke' };

/** The row the last issued code was stored as. */
const storedRow = () => otpCreate.mock.calls.at(-1)![0].data as { codePlain: string | null; codeHash: string };

const startedIn = env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  otpFindFirst.mockResolvedValue(null);
  otpUpdateMany.mockResolvedValue({ count: 0 });
  otpCreate.mockResolvedValue({});
  otpCount.mockResolvedValue(0);
  otpAggregate.mockResolvedValue({ _sum: { attempts: 0 } });
});

afterEach(() => {
  env.NODE_ENV = startedIn;
});

describe('sign-in codes in production', () => {
  beforeEach(() => {
    env.NODE_ENV = 'production';
  });

  it('reports dev tools as off', () => {
    expect(devToolsEnabled()).toBe(false);
  });

  it('answers a customer sign-in without the code, and stores no readable copy', async () => {
    const answer = await issueSignInOtp('+254700000001', log);

    expect(answer).toEqual({});
    expect(storedRow().codePlain).toBeNull();
    expect(storedRow().codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('answers a staff sign-in with the masked email only, and stores no readable copy', async () => {
    const answer = await issueAdminSignInOtp(staff, log);

    expect(answer).toEqual({ maskedEmail: 'j***@onyxhawk.co.ke' });
    expect(storedRow().codePlain).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('sign-in codes in development', () => {
  beforeEach(() => {
    env.NODE_ENV = 'development';
  });

  it('reports dev tools as on', () => {
    expect(devToolsEnabled()).toBe(true);
  });

  it('answers a customer sign-in with the code and stores the same code readably', async () => {
    const answer = await issueSignInOtp('+254700000001', log);

    expect(answer.devOtp).toMatch(/^\d{6}$/);
    expect(storedRow().codePlain).toBe(answer.devOtp);
  });

  it('answers a staff sign-in with the code and stores the same code readably', async () => {
    const answer = await issueAdminSignInOtp(staff, log);

    expect(answer.maskedEmail).toBe('j***@onyxhawk.co.ke');
    expect(answer.devOtp).toMatch(/^\d{6}$/);
    expect(storedRow().codePlain).toBe(answer.devOtp);
  });
});

describe('limits on sending codes', () => {
  it('makes every recent code count towards the 30-second wait, used or not', async () => {
    otpFindFirst.mockResolvedValueOnce({ id: 'used', consumedAt: new Date() });

    await expect(issueSignInOtp('+254700000001', log)).rejects.toMatchObject({ code: 'TOO_SOON' });
    expect(otpFindFirst.mock.calls[0]![0].where).not.toHaveProperty('consumedAt');
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('sends no more than five codes to one account in an hour', async () => {
    otpCount.mockResolvedValueOnce(5);

    await expect(issueAdminSignInOtp(staff, log)).rejects.toMatchObject({ code: 'TOO_MANY_CODES' });
    expect(otpCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends no new code after ten wrong guesses in the hour', async () => {
    otpAggregate.mockResolvedValueOnce({ _sum: { attempts: 10 } });

    await expect(issueSignInOtp('+254700000001', log)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(sendSms).not.toHaveBeenCalled();
  });
});

describe('checking a code', () => {
  const row = (attempts = 0) => ({ id: 'otp1', codeHash: sha256('123456'), attempts });

  it('counts a guess in one step that refuses a sixth, then turns a wrong code away', async () => {
    otpFindFirst.mockResolvedValueOnce(row());
    otpUpdateMany.mockResolvedValueOnce({ count: 1 });

    expect(await verifySignInOtp('+254700000001', '000000')).toBe(false);
    expect(otpUpdateMany).toHaveBeenCalledTimes(1);
    expect(otpUpdateMany).toHaveBeenCalledWith({
      where: { id: 'otp1', consumedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
  });

  it('accepts the right code once, uses it up and takes its guess off the wrong count', async () => {
    otpFindFirst.mockResolvedValueOnce(row(2));
    otpUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    expect(await verifyAdminSignInOtp(staff.phone, '123456')).toBe(true);
    expect(otpUpdateMany).toHaveBeenLastCalledWith({
      where: { id: 'otp1', consumedAt: null },
      data: { consumedAt: expect.any(Date), attempts: { decrement: 1 } },
    });
  });

  it('turns even the right code away when parallel guesses used up the last try', async () => {
    otpFindFirst.mockResolvedValueOnce(row(4));
    otpUpdateMany.mockResolvedValueOnce({ count: 0 });

    expect(await verifySignInOtp('+254700000001', '123456')).toBe(false);
  });

  it('retires a code after five wrong guesses', async () => {
    otpFindFirst.mockResolvedValueOnce(row(5));

    await expect(verifySignInOtp('+254700000001', '123456')).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(otpUpdateMany).toHaveBeenCalledWith({ where: { id: 'otp1', consumedAt: null }, data: { consumedAt: expect.any(Date) } });
  });

  it('checks no code after ten wrong guesses at the account in the hour', async () => {
    otpFindFirst.mockResolvedValueOnce(row(1));
    otpAggregate.mockResolvedValueOnce({ _sum: { attempts: 10 } });

    await expect(verifyAdminSignInOtp(staff.phone, '123456')).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(otpUpdateMany).not.toHaveBeenCalled();
  });
});
