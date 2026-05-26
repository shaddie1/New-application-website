import { randomInt } from 'node:crypto';
import { prisma } from '../db.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid OCR confusion

function makeCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

/** Generate a unique referral code; retries on collision. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    const existing = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  // Pathological case — widen the namespace.
  return makeCode(8);
}
