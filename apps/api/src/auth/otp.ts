import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { sha256 } from './hash.js';
import { sendSms, type SmsLogger } from './sms.js';
import { maskEmail, sendEmail, signInCodeEmail } from './email.js';
import { env } from '../env.js';

const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const MAX_ATTEMPTS = 5;
const MIN_RESEND_INTERVAL_MS = 30 * 1000; // anti-spam: 30s between OTP sends to same number

/** Customer codes travel by SMS; staff codes by email. Same generation, expiry and one-time use. */
type Purpose = 'SIGN_IN' | 'ADMIN_SIGN_IN';

/**
 * Generate and store a code for the phone + purpose. Invalidates any prior
 * unused codes for the pair, so only the latest one works.
 */
async function createOtp(phone: string, purpose: Purpose, email: string | null): Promise<string> {
  // Anti-spam: refuse if a code was issued within the last 30s and isn't yet consumed.
  const recent = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null, createdAt: { gt: new Date(Date.now() - MIN_RESEND_INTERVAL_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) throw new OtpError('TOO_SOON', 'Please wait before requesting another code');

  await prisma.otpCode.updateMany({
    where: { phone, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const isDev = env.NODE_ENV !== 'production';
  await prisma.otpCode.create({
    data: {
      phone,
      email,
      codeHash: sha256(code),
      codePlain: isDev ? code : null,
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
  return env.NODE_ENV === 'production' ? {} : { devOtp: code };
}

/**
 * Issue a staff ADMIN_SIGN_IN code, delivered to the account's email. The
 * phone stays the lookup key so the login screen does not change shape.
 */
export async function issueAdminSignInOtp(
  user: { phone: string; email: string },
  log: SmsLogger,
): Promise<{ maskedEmail: string; devOtp?: string }> {
  const code = await createOtp(user.phone, 'ADMIN_SIGN_IN', user.email);
  await sendEmail(user.email, signInCodeEmail(code), log);
  const maskedEmail = maskEmail(user.email);
  return env.NODE_ENV === 'production' ? { maskedEmail } : { maskedEmail, devOtp: code };
}

/** Verify a code for the phone + purpose. Consumes it on success. Returns true if valid. */
async function verifyOtp(phone: string, code: string, purpose: Purpose): Promise<boolean> {
  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return false;

  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    throw new OtpError('TOO_MANY_ATTEMPTS', 'Too many incorrect codes — request a new one');
  }

  if (row.codeHash !== sha256(code)) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }

  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return true;
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
  constructor(public code: 'TOO_SOON' | 'TOO_MANY_ATTEMPTS', message: string) {
    super(message);
    this.name = 'OtpError';
  }
}
