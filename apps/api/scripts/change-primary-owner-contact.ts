/**
 * Change the primary owner's sign-in email and/or phone. The app refuses both
 * (nobody edits the primary owner's sign-in details through the API, the
 * primary owner included), so this is the one way, run by someone with
 * production database access. Runbook: DEPLOY.md, "Primary owner".
 *
 *   pnpm --filter @onyxhawk/api change-primary-owner-contact --email new@onyxhawkcleaningservice.com
 *   pnpm --filter @onyxhawk/api change-primary-owner-contact --phone +254712345678
 *   pnpm --filter @onyxhawk/api change-primary-owner-contact --email ... --phone ... --apply
 *
 * Without --apply it only prints what would change. With it, the change and a
 * sign-out everywhere (every refresh token revoked, and any unused sign-in codes
 * voided) commit together, as for an email change on the Team page. Refuses an
 * email or phone that another account already uses.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args: { email?: string; phone?: string; apply: boolean } = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--email') args.email = argv[++i];
    else if (arg === '--phone') args.phone = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const { email: rawEmail, phone, apply } = parseArgs(process.argv.slice(2));
  const email = rawEmail?.trim().toLowerCase();
  if (!email && !phone) throw new Error('Pass --email <address>, --phone <E.164>, or both. Add --apply to write.');
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Not an email address: ${rawEmail}`);
  if (phone !== undefined && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error(`Phone must be E.164, e.g. +254712345678: ${phone}`);

  await prisma.$transaction(async (tx) => {
    const primary = await tx.user.findFirst({
      where: { isPrimaryOwner: true },
      select: { id: true, fullName: true, email: true, phone: true },
    });
    if (!primary) throw new Error('There is no primary owner. Set one first: set-primary-owner.ts <phone>.');

    if (email !== undefined) {
      const taken = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: primary.id } },
        select: { fullName: true },
      });
      if (taken) throw new Error(`${email} is already the email of ${taken.fullName}.`);
    }
    if (phone !== undefined) {
      const taken = await tx.user.findFirst({ where: { phone, id: { not: primary.id } }, select: { fullName: true } });
      if (taken) throw new Error(`${phone} is already the phone of ${taken.fullName}.`);
    }

    const after = { email: email ?? primary.email, phone: phone ?? primary.phone };
    console.log(`Primary owner: ${primary.fullName}`);
    console.log(`  email: ${primary.email ?? '(none)'} -> ${after.email ?? '(none)'}`);
    console.log(`  phone: ${primary.phone} -> ${after.phone}`);
    if (!apply) {
      console.log('Dry run: nothing changed. Re-run with --apply to write it.');
      return;
    }

    await tx.user.update({ where: { id: primary.id }, data: after });
    const revoked = await tx.refreshToken.updateMany({
      where: { userId: primary.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Sign-in codes are keyed by phone; void any still waiting under the old one.
    await tx.otpCode.updateMany({ where: { phone: primary.phone, consumedAt: null }, data: { consumedAt: new Date() } });
    console.log(`Applied. Signed out of ${revoked.count} session(s); sign in again with ${after.email ?? 'the new details'}.`);
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
