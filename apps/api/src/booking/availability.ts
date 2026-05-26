import type { TimeSlot, AvailabilityResult } from '@onyxhawk/types';
import { prisma } from '../db.js';

// Fixed daily slot grid (matches mockup 06: 08:00, 10:30, 13:00, 15:00, 17:00).
// When we scale we'll move this to a crew-availability table; for now, daily
// fixed grid + booked-out detection is enough to demo the flow.
const DAILY_SLOT_HOURS_MINUTES: Array<[number, number]> = [
  [8, 0],
  [10, 30],
  [13, 0],
  [15, 0],
  [17, 0],
];

const SLOT_DURATION_MINUTES = 4 * 60; // assume any slot blocks the next 4h
const MAX_CONCURRENT_PER_SLOT = 3;    // we can run up to N crews in parallel

/**
 * Return the day's slot grid with each slot marked available or not.
 * `date` is YYYY-MM-DD interpreted in Africa/Nairobi.
 */
export async function getAvailability(date: string): Promise<AvailabilityResult> {
  const dayStart = nairobiDateToUtc(date, 0, 0);
  const dayEnd = nairobiDateToUtc(date, 23, 59);

  const sameDayBookings = await prisma.booking.findMany({
    where: {
      scheduledAt: { gte: dayStart, lt: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: { scheduledAt: true },
  });

  const slots: TimeSlot[] = DAILY_SLOT_HOURS_MINUTES.map(([h, m]) => {
    const startsAt = nairobiDateToUtc(date, h, m);
    const overlapping = sameDayBookings.filter((b) =>
      overlaps(b.scheduledAt, startsAt, SLOT_DURATION_MINUTES),
    ).length;
    return {
      startsAt: startsAt.toISOString(),
      available: !isPast(startsAt) && overlapping < MAX_CONCURRENT_PER_SLOT,
    };
  });

  return { date, slots };
}

function overlaps(a: Date, b: Date, slotMinutes: number): boolean {
  const slotMs = slotMinutes * 60_000;
  return Math.abs(a.getTime() - b.getTime()) < slotMs;
}

function isPast(d: Date): boolean {
  return d.getTime() < Date.now();
}

/**
 * Convert a Nairobi local date+time (YYYY-MM-DD, hour, minute) to a UTC Date.
 * Africa/Nairobi has no DST (fixed UTC+3) so we can subtract 3 hours.
 */
function nairobiDateToUtc(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`invalid date: ${date}`);
  // Construct as if the wall-clock time were UTC, then subtract 3 hours.
  return new Date(Date.UTC(y, m - 1, d, hour - 3, minute));
}
