/**
 * Make one owner the primary owner: the majority shareholder, the only person
 * who can change other owners' roles and emails. A one-off, deliberately not
 * a UI or API action.
 *
 *   pnpm --filter @onyxhawk/api set-primary-owner +254115247988
 *
 * The account must already be an owner. Refuses when someone else is already
 * the primary owner (the database's partial unique index refuses it too), and
 * running it again for the same person changes nothing.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [phone] = process.argv.slice(2);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Usage: set-primary-owner.ts <phoneE164 e.g. +254115247988>');
  }

  const user = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { phone },
      select: { id: true, fullName: true, isOwner: true, isPrimaryOwner: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw new Error(`No active account for ${phone}.`);
    if (!target.isOwner) {
      throw new Error(`${target.fullName} (${phone}) is not an owner. Make them one first: make-admin.ts ${phone} <email> "<name>" OWNER`);
    }
    const other = await tx.user.findFirst({
      where: { isPrimaryOwner: true, id: { not: target.id } },
      select: { fullName: true, phone: true },
    });
    if (other) throw new Error(`${other.fullName} (${other.phone}) is already the primary owner. There can be only one.`);

    return tx.user.update({
      where: { id: target.id },
      data: { isPrimaryOwner: true },
      select: { id: true, fullName: true, phone: true, email: true, isOwner: true, isPrimaryOwner: true },
    });
  });

  console.log('Primary owner:', user);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
