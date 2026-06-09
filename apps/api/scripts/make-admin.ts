/**
 * Provision (or promote) an admin user.
 *
 *   tsx scripts/make-admin.ts <phoneE164> [fullName] [ADMIN|SUPPORT]
 *   e.g. tsx scripts/make-admin.ts +254712480392 "Jane Aluoch" ADMIN
 *
 * Idempotent: creates the user if the phone is new, otherwise just sets the role.
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [phone, fullName = 'OnyxHawk Admin', roleArg = 'ADMIN'] = process.argv.slice(2);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Usage: make-admin.ts <phoneE164 e.g. +254712480392> [fullName] [ADMIN|SUPPORT|OWNER]');
  }
  // OWNER = an ADMIN who can also manage other admins (super-admin).
  const isOwner = roleArg === 'OWNER';
  const role = roleArg === 'SUPPORT' ? UserRole.SUPPORT : UserRole.ADMIN;
  const referralCode = 'OH' + Math.random().toString(36).slice(2, 8).toUpperCase();

  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, fullName, role, isOwner, phoneVerified: true, referralCode },
    update: { role, ...(isOwner ? { isOwner: true } : {}) },
  });

  console.log('Admin ready:', { id: user.id, phone: user.phone, name: user.fullName, role: user.role, isOwner: user.isOwner });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
