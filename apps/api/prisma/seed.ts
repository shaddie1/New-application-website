/**
 * Seed catalog data (service lines, clean types, add-ons) and points rules.
 * Idempotent — uses upsert on natural keys.
 */
import { PrismaClient, ServiceBadge, PointsReason } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── Service lines ────────────────────────────────────────────────────────
  const residential = await prisma.serviceLine.upsert({
    where: { code: 'residential' },
    create: {
      code: 'residential',
      name: 'Residential',
      tagline: 'Standard, deep, and move-in/out cleans for homes and apartments.',
      badge: ServiceBadge.MOST_BOOKED,
      colorHex: '#4F7B5C',
      fromPriceCents: 280_000, // KSh 2,800
      sortOrder: 1,
    },
    update: {},
  });

  const office = await prisma.serviceLine.upsert({
    where: { code: 'office' },
    create: {
      code: 'office',
      name: 'Office & commercial',
      tagline: 'Recurring janitorial scheduled around your business hours.',
      colorHex: '#3A5E7A',
      fromPriceCents: 450_000, // KSh 4,500
      sortOrder: 2,
    },
    update: {},
  });

  const hospital = await prisma.serviceLine.upsert({
    where: { code: 'hospital' },
    create: {
      code: 'hospital',
      name: 'Hospital & medical',
      tagline: 'Documented hospital-grade protocols, color-coded equipment.',
      badge: ServiceBadge.CERTIFIED,
      colorHex: '#A8556B',
      quoteOnly: true,
      sortOrder: 3,
    },
    update: {},
  });

  const postBuild = await prisma.serviceLine.upsert({
    where: { code: 'post_build' },
    create: {
      code: 'post_build',
      name: 'Post-construction',
      tagline: 'Dust-down to final wipe — we hand you a finished space.',
      colorHex: '#C97E3B',
      fromPriceCents: 1_200_000, // KSh 12,000
      sortOrder: 4,
    },
    update: {},
  });

  const fumigation = await prisma.serviceLine.upsert({
    where: { code: 'fumigation' },
    create: {
      code: 'fumigation',
      name: 'Fumigation',
      tagline: 'Licensed pest and odour control across all sectors.',
      colorHex: '#6B4E8C',
      quoteOnly: true,
      sortOrder: 5,
    },
    update: {},
  });

  // ── Clean types (residential only — others are quote-only or recurring) ──
  for (const [code, name, subtitle, basePriceCents] of [
    ['standard', 'Standard', 'Maintenance', 280_000],
    ['deep', 'Deep', 'Top-to-bottom', 405_000],
    ['move_out', 'Move-out', 'Empty unit', 520_000],
  ] as const) {
    await prisma.cleanType.upsert({
      where: { serviceLineId_code: { serviceLineId: residential.id, code } },
      create: { serviceLineId: residential.id, code, name, subtitle, basePriceCents },
      update: { name, subtitle, basePriceCents },
    });
  }

  // Office gets a single "recurring" base type for now.
  await prisma.cleanType.upsert({
    where: { serviceLineId_code: { serviceLineId: office.id, code: 'recurring' } },
    create: { serviceLineId: office.id, code: 'recurring', name: 'Recurring janitorial', basePriceCents: 450_000 },
    update: {},
  });

  // ── Add-ons (priced as shown on screen 05) ───────────────────────────────
  const addOns = [
    { code: 'fridge_oven', name: 'Inside fridge & oven', priceCents: 60_000 },
    { code: 'cabinets', name: 'Inside cabinets', priceCents: 45_000 },
    { code: 'windows_interior', name: 'Windows (interior)', priceCents: 80_000 },
    { code: 'balcony_patio', name: 'Balcony & patio', priceCents: 35_000 },
  ];
  for (const a of addOns) {
    await prisma.addOn.upsert({
      where: { serviceLineId_code: { serviceLineId: residential.id, code: a.code } },
      create: { serviceLineId: residential.id, ...a, sortOrder: addOns.indexOf(a) },
      update: { name: a.name, priceCents: a.priceCents },
    });
  }

  // ── Points rules (screen 14 numbers) ─────────────────────────────────────
  // BOOKING_BASE: 10 pts per KSh 100 → 10/10000 cents
  await prisma.pointsRule.upsert({
    where: { reason: PointsReason.BOOKING_BASE },
    create: { reason: PointsReason.BOOKING_BASE, numerator: 10, denominator: 10_000, description: '10 pts per KSh 100' },
    update: {},
  });
  await prisma.pointsRule.upsert({
    where: { reason: PointsReason.REFERRAL },
    create: { reason: PointsReason.REFERRAL, numerator: 500, denominator: 1, description: '500 pts per referral' },
    update: {},
  });
  await prisma.pointsRule.upsert({
    where: { reason: PointsReason.RECURRING_BONUS },
    create: { reason: PointsReason.RECURRING_BONUS, numerator: 200, denominator: 1, description: '200 pts on recurring contract sign-up' },
    update: {},
  });
  await prisma.pointsRule.upsert({
    where: { reason: PointsReason.WEEKEND_MULTIPLIER },
    create: { reason: PointsReason.WEEKEND_MULTIPLIER, numerator: 2, denominator: 1, description: '2× points on Sat/Sun bookings' },
    update: {},
  });
  await prisma.pointsRule.upsert({
    where: { reason: PointsReason.PHOTO_DOCUMENTATION },
    create: { reason: PointsReason.PHOTO_DOCUMENTATION, numerator: 220, denominator: 1, description: '+220 pts per fully documented room' },
    update: {},
  });

  console.log('Seeded:', { residential: residential.id, office: office.id, hospital: hospital.id, postBuild: postBuild.id, fumigation: fumigation.id });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
