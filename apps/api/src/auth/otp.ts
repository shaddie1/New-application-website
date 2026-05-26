import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';
import { sha256 } from './hash.js';
import { sendSms, type SmsLogger } from './sms.js';
import { env } from '../env.js';

const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const MAX_ATTEMPTS = 5;
const MIN_RESEND_INTERVAL_MS = 30 * 1000; // anti-spam: 30s between OTP sends to same number

/** Issue a fresh OTP for SIGN_IN. Invalidates any prior unused codes for this phone+purpose. */
export async function issueSignInOtp(phone: string, log: SmsLogger): Promise<{ devOtp?: string }> {
  // Anti-spam: refuse if a code was issued within the last 30s and isn't yet consumed.
  const recent = await prisma.otpCode.findFirst({
    where: { phone, purpose: 'SIGN_IN', consumedAt: null, createdAt: { gt: new Date(Date.now() - MIN_RESEND_INTERVAL_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) throw new OtpError('TOO_SOON', 'Please wait before requesting another code');

  // Invalidate prior unused codes for this phone+purpose.
  await prisma.otpCode.updateMany({
    where: { phone, purpose: 'SIGN_IN', consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      phone,
      codeHash: sha256(code),
      purpose: 'SIGN_IN',
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await sendSms(phone, `Your OnyxHawk code is ${code}. It expires in 10 minutes.`, log);

  // In dev we return the OTP for easy testing; never in production.
  return env.NODE_ENV === 'production' ? {} : { devOtp: code };
}

/** Verify a SIGN_IN OTP. Consumes the code on success. Returns true if valid. */
export async function verifySignInOtp(phone: string, code: string): Promise<boolean> {
  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose: 'SIGN_IN', consumedAt: null, expiresAt: { gt: new Date() } },
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

export class OtpError extends Error {
  constructor(public code: 'TOO_SOON' | 'TOO_MANY_ATTEMPTS', message: string) {
    super(message);
    this.name = 'OtpError';
  }
}
