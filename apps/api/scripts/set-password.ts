/**
 * Set (or change) a staff member's sign-in password.
 *
 *   pnpm --filter @onyxhawk/api set-password +254712480392
 *
 * The password is typed at a prompt rather than passed as an argument, so it
 * does not end up in shell history. Afterwards the account can sign in at the
 * admin portal with phone + password, no SMS involved.
 */
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/auth/password.js';

const prisma = new PrismaClient();

async function main() {
  const [phone] = process.argv.slice(2);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Usage: set-password.ts <phoneE164 e.g. +254712480392>');
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, fullName: true, role: true, isOwner: true, deletedAt: true, passwordHash: true },
  });
  if (!user || user.deletedAt) {
    throw new Error(`No active account for ${phone}. Provision it first with make-admin.ts.`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`Setting a password for ${user.fullName} (${phone}, ${user.role}${user.isOwner ? ', owner' : ''}).`);
    if (user.passwordHash) console.log('This account already has a password — it will be replaced.');

    const password = (await rl.question(`New password (min ${MIN_PASSWORD_LENGTH} characters): `)).trim();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const confirm = (await rl.question('Confirm password: ')).trim();
    if (password !== confirm) throw new Error('Passwords do not match.');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  } finally {
    rl.close();
  }

  console.log(`\nDone. ${user.fullName} can now sign in with their phone number and this password.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
