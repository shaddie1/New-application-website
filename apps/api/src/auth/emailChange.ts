import type { RequestEmailChangeResult } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { env } from '../env.js';
import { maskEmail } from '../email/format.js';
import { sendEmail, trySendEmail, type EmailLogger } from '../email/service.js';
import { emailChangeApprovalEmail, emailChangeCodeEmail, signInEmailChangedEmail } from '../email/templates.js';
import { sha256 } from './hash.js';
import { createOtp, MAX_ATTEMPTS, OTP_TTL_MS } from './otp.js';

/**
 * A staff member changing their own sign-in email. A code goes to the new
 * address, proving they hold it; an owner also gets a code at their current
 * address, so a signed-in session alone cannot move an owner's account. The
 * profile routes check who may start this (staff, an email session, never the
 * primary owner) before calling in.
 *
 * Codes reuse the OTP table, keyed by the account's phone like every other
 * code, with the address each was sent to in `email`.
 */

type Member = { id: string; phone: string; email: string | null; fullName: string; isOwner: boolean };

export async function requestEmailChange(member: Member, newEmail: string, log: EmailLogger): Promise<RequestEmailChangeResult> {
  const expiresInMinutes = OTP_TTL_MS / 60_000;
  const newCode = await createOtp(member.phone, 'EMAIL_CHANGE_NEW', newEmail);
  await sendEmail(newEmail, emailChangeCodeEmail({ code: newCode, expiresInMinutes }), log, { staffId: member.id });

  let currentCode: string | undefined;
  if (member.isOwner && member.email) {
    currentCode = await createOtp(member.phone, 'EMAIL_CHANGE_CURRENT', member.email);
    await sendEmail(member.email, emailChangeApprovalEmail({ code: currentCode, expiresInMinutes, newEmail }), log, {
      staffId: member.id,
    });
  }

  const result: RequestEmailChangeResult = {
    ok: true,
    sentTo: maskEmail(newEmail),
    approvalSentTo: currentCode && member.email ? maskEmail(member.email) : null,
  };
  if (env.NODE_ENV !== 'production') result.devCodes = { newCode, ...(currentCode && { currentCode }) };
  return result;
}

export type ConfirmOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: 'NO_REQUEST' | 'CURRENT_CODE_REQUIRED' | 'WRONG_CODE' | 'TOO_MANY_ATTEMPTS' | 'TAKEN' };

/**
 * Check every code the member owes before consuming any, so a typo in one
 * never burns the other. On success the new email, the consumed codes and a
 * sign-out everywhere commit together; the old address is told afterwards.
 */
export async function confirmEmailChange(
  member: Member,
  codes: { newCode: string; currentCode?: string },
  log: EmailLogger,
): Promise<ConfirmOutcome> {
  const now = new Date();
  const latest = (purpose: 'EMAIL_CHANGE_NEW' | 'EMAIL_CHANGE_CURRENT') =>
    prisma.otpCode.findFirst({
      where: { phone: member.phone, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

  const newRow = await latest('EMAIL_CHANGE_NEW');
  if (!newRow?.email) return { ok: false, reason: 'NO_REQUEST' };
  const currentRow = member.isOwner ? await latest('EMAIL_CHANGE_CURRENT') : null;
  if (member.isOwner) {
    // The approval code must have gone to the address the account still has.
    if (!currentRow || currentRow.email?.toLowerCase() !== member.email?.toLowerCase()) return { ok: false, reason: 'NO_REQUEST' };
    if (!codes.currentCode) return { ok: false, reason: 'CURRENT_CODE_REQUIRED' };
  }

  const rows = [newRow, ...(currentRow ? [currentRow] : [])];
  if (rows.some((r) => r.attempts >= MAX_ATTEMPTS)) {
    await prisma.otpCode.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { consumedAt: now } });
    return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  const wrong = [
    ...(newRow.codeHash !== sha256(codes.newCode) ? [newRow] : []),
    ...(currentRow && currentRow.codeHash !== sha256(codes.currentCode ?? '') ? [currentRow] : []),
  ];
  if (wrong.length > 0) {
    await prisma.otpCode.updateMany({ where: { id: { in: wrong.map((r) => r.id) } }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: 'WRONG_CODE' };
  }

  const newEmail = newRow.email;
  const taken = await prisma.user.findFirst({
    where: { email: { equals: newEmail, mode: 'insensitive' }, id: { not: member.id } },
    select: { id: true },
  });
  if (taken) return { ok: false, reason: 'TAKEN' };

  await prisma.$transaction(async (tx) => {
    await tx.otpCode.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { consumedAt: now } });
    await tx.user.update({ where: { id: member.id }, data: { email: newEmail } });
    await tx.refreshToken.updateMany({ where: { userId: member.id, revokedAt: null }, data: { revokedAt: now } });
  });

  if (member.email) {
    await trySendEmail(member.email, signInEmailChangedEmail({ fullName: member.fullName, newEmail }), log, { staffId: member.id });
  }
  return { ok: true, email: newEmail };
}
