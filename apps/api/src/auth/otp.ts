import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { sha256 } from './hash.js';
import { sendSms, type SmsLogger } from './sms.js';
import { maskEmail } from '../email/format.js';
import { sendEmail } from '../email/service.js';
import { adminSignInCodeEmail } from '../email/templates.js';
import { env } from '../env.js';

const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const MAX_ATTEMPTS = 5;                   // wrong guesses one code allows
const MIN_RESEND_INTERVAL_MS = 30 * 1000; // 30s between codes to the same account
const HOUR_MS = 60 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;             // codes one account can be sent in an hour
const MAX_WRONG_PER_HOUR = 10;            // wrong guesses one account allows in an hour

const since = (ms: number) => new Date(Date.now() - ms);

/** Customer codes travel by SMS; staff codes by email. Same generation, expiry and one-time use. */
type Purpose = 'SIGN_IN' | 'ADMIN_SIGN_IN';

/**
 * Whether dev tools are on: codes are stored in readable form, and
 * `GET /admin/otps/recent` exists to show them. Read on every call, never
 * cached, so the answer follows the environment the server is running in.
 */
export function devToolsEnabled(): boolean {
  return env.NODE_ENV !== 'production';
}

/**
 * Generate and store a code for the phone + purpose. Invalidates any prior
 * unused codes for the pair, so only the latest one works.
 */
async function createOtp(phone: string, purpose: Purpose, email: string | null): Promise<string> {
  // Every code counts towards the wait and the hourly cap, used or not, so
  // using a code up with wrong guesses never earns a fresh one sooner.
  const recent = await prisma.otpCode.findFirst({
    where: { phone, purpose, createdAt: { gt: since(MIN_RESEND_INTERVAL_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) throw new OtpError('TOO_SOON', 'Please wait before requesting another code');

  const sentLastHour = await prisma.otpCode.count({ where: { phone, purpose, createdAt: { gt: since(HOUR_MS) } } });
  if (sentLastHour >= MAX_CODES_PER_HOUR) {
    throw new OtpError('TOO_MANY_CODES', 'Too many codes requested. Try again in an hour.');
  }
  if ((await wrongGuessesLastHour(phone, purpose)) >= MAX_WRONG_PER_HOUR) throw tooManyWrong();

  await prisma.otpCode.updateMany({
    where: { phone, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      phone,
      email,
      codeHash: sha256(code),
      codePlain: devToolsEnabled() ? code : null,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return code;
}

/** Issue a fresh customer SIGN_IN code by SMS. */
export async function issueSignInOtp(phone: string, log: SmsLogger): Promise<{ devOtp?: string }> {
  const code = await createOtp(phone, 'SIGN_IN', null);
  await sendSms(phone, `Your OnyxHawk code is ${code}. It expires in 10 minutes.`, log);

  // In dev we return the OTP for easy testing; never in production.
  return devToolsEnabled() ? { devOtp: code } : {};
}

/**
 * Issue a staff ADMIN_SIGN_IN code, delivered to the account's email. Staff
 * sign in by email, but the code is stored against the account's phone, its
 * stable key, so the OTP table and scripts/issue-otp.ts are unchanged.
 */
export async function issueAdminSignInOtp(
  user: { phone: string; email: string },
  log: SmsLogger,
): Promise<{ maskedEmail: string; devOtp?: string }> {
  const code = await createOtp(user.phone, 'ADMIN_SIGN_IN', user.email);
  await sendEmail(user.email, adminSignInCodeEmail({ code, expiresInMinutes: OTP_TTL_MS / 60_000 }), log);
  const maskedEmail = maskEmail(user.email);
  return devToolsEnabled() ? { maskedEmail, devOtp: code } : { maskedEmail };
}

/** Verify a code for the phone + purpose. Consumes it on success. Returns true if valid. */
async function verifyOtp(phone: string, code: string, purpose: Purpose): Promise<boolean> {
  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return false;

  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    throw new OtpError('TOO_MANY_ATTEMPTS', 'Too many incorrect codes — request a new one');
  }
  if ((await wrongGuessesLastHour(phone, purpose)) >= MAX_WRONG_PER_HOUR) throw tooManyWrong();

  // Count this guess before checking it, in one database step, so guesses
  // sent at the same moment cannot get past the per-code limit.
  const counted = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return false;

  if (row.codeHash !== sha256(code)) return false;

  // A right code is used up, and its guess no longer counts as a wrong one.
  const used = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date(), attempts: { decrement: 1 } },
  });
  return used.count === 1;
}

/** Wrong guesses at this account's codes in the last hour. */
async function wrongGuessesLastHour(phone: string, purpose: Purpose): Promise<number> {
  const sum = await prisma.otpCode.aggregate({
    where: { phone, purpose, createdAt: { gt: since(HOUR_MS) } },
    _sum: { attempts: true },
  });
  return sum._sum.attempts ?? 0;
}

function tooManyWrong(): OtpError {
  return new OtpError('TOO_MANY_ATTEMPTS', 'Too many incorrect codes. Try again in an hour.');
}

/** Verify a customer SIGN_IN OTP. */
export function verifySignInOtp(phone: string, code: string): Promise<boolean> {
  return verifyOtp(phone, code, 'SIGN_IN');
}

/** Verify a staff ADMIN_SIGN_IN OTP. */
export function verifyAdminSignInOtp(phone: string, code: string): Promise<boolean> {
  return verifyOtp(phone, code, 'ADMIN_SIGN_IN');
}

export class OtpError extends Error {
  constructor(public code: 'TOO_SOON' | 'TOO_MANY_CODES' | 'TOO_MANY_ATTEMPTS', message: string) {
    super(message);
    this.name = 'OtpError';
  }
}
