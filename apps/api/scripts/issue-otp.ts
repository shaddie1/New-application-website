/**
 * Break-glass sign-in: issue a SIGN_IN code for a staff phone directly in the
 * database, for when SMS delivery is unavailable (e.g. Safaricom DND blocking
 * the shared sender). Mirrors issueSignInOtp(): prior unused codes are
 * consumed, the code is 6 random digits hashed with sha256, valid 10 minutes.
 *
 *   pnpm --filter @onyxhawk/api issue-otp +254712480392
 *
 * Enter the printed code on the login page. Do not press "Send code" again
 * afterwards — issuing a new code voids this one.
 */
import { createHash, randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [phone] = process.argv.slice(2);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Usage: issue-otp.ts <phoneE164 e.g. +254712480392>');
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { fullName: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new Error(`No active account for ${phone}. Provision it first (make-admin.ts).`);

  await prisma.otpCode.updateMany({
    where: { phone, purpose: 'SIGN_IN', consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.otpCode.create({
    data: {
      phone,
      codeHash: createHash('sha256').update(code).digest('hex'),
      purpose: 'SIGN_IN',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  console.log(`Sign-in code for ${user.fullName} (${phone}, ${user.role}): ${code}`);
  console.log('Valid for 10 minutes. Do not press "Send code" after this — that voids it.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
