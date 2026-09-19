/**
 * Provision (or promote) an admin user.
 *
 *   tsx scripts/make-admin.ts <phoneE164> <email> [fullName] [ADMIN|SUPPORT|OWNER]
 *   e.g. tsx scripts/make-admin.ts +254712480392 jane@onyxhawk.co.ke "Jane Aluoch" ADMIN
 *
 * Idempotent: creates the user if the phone is new, otherwise sets the role
 * and email. Staff sign-in codes are emailed, so the email is required.
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [phone, email, fullName = 'OnyxHawk Admin', roleArg = 'ADMIN'] = process.argv.slice(2);
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: make-admin.ts <phoneE164 e.g. +254712480392> <email> [fullName] [ADMIN|SUPPORT|OWNER]');
  }
  // OWNER = an ADMIN who can also manage other admins (super-admin).
  const isOwner = roleArg === 'OWNER';
  const role = roleArg === 'SUPPORT' ? UserRole.SUPPORT : UserRole.ADMIN;
  const referralCode = 'OH' + Math.random().toString(36).slice(2, 8).toUpperCase();

  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, email: email.toLowerCase(), fullName, role, isOwner, phoneVerified: true, referralCode },
    update: { role, email: email.toLowerCase(), ...(isOwner ? { isOwner: true } : {}) },
  });

  console.log('Admin ready:', { id: user.id, phone: user.phone, email: user.email, name: user.fullName, role: user.role, isOwner: user.isOwner });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
