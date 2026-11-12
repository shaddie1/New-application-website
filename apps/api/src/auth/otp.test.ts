import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A sign-in code is readable in two places outside the message that carries
// it: the `devOtp` field of the sign-in answer, and the `codePlain` column the
// Dashboard's dev panel reads. Both exist for development only.

const otpFindFirst = vi.fn();
const otpUpdateMany = vi.fn();
const otpCreate = vi.fn();
vi.mock('../db.js', () => ({
  prisma: { otpCode: { findFirst: otpFindFirst, updateMany: otpUpdateMany, create: otpCreate } },
}));

const sendSms = vi.fn();
vi.mock('./sms.js', () => ({ sendSms }));

const sendEmail = vi.fn();
vi.mock('./email.js', () => ({
  sendEmail,
  maskEmail: () => 'j***@onyxhawk.co.ke',
  signInCodeEmail: (code: string) => ({ subject: 'Your code', text: code }),
}));

const { env } = await import('../env.js');
const { devToolsEnabled, issueAdminSignInOtp, issueSignInOtp } = await import('./otp.js');

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
