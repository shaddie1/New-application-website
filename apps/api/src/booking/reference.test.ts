import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { generateBookingReference } from './reference.js';

/** Minimal tx stub: only bookingSequence.upsert is touched. */
function fakeTx(lastSeq: number) {
  const upsert = vi.fn().mockResolvedValue({ lastSeq });
  const tx = { bookingSequence: { upsert } } as unknown as Prisma.TransactionClient;
  return { tx, upsert };
}

describe('generateBookingReference', () => {
  it('formats as OH-YYMM-XXX using the Africa/Nairobi calendar month', () => {
    const { tx } = fakeTx(7);
    // 2026-03-15 12:00 EAT → YY=26, MM=03
    return generateBookingReference(tx, new Date('2026-03-15T12:00:00+03:00')).then((ref) => {
      expect(ref).toBe('OH-2603-007');
    });
  });

  it('zero-pads the sequence to three digits and passes larger numbers through', async () => {
    const { tx: t1 } = fakeTx(1);
    expect(await generateBookingReference(t1, new Date('2026-12-01T12:00:00+03:00'))).toBe('OH-2612-001');

    const { tx: t2 } = fakeTx(1234);
    expect(await generateBookingReference(t2, new Date('2026-12-01T12:00:00+03:00'))).toBe('OH-2612-1234');
  });

  it('atomically increments the sequence row for the current month', async () => {
    const { tx, upsert } = fakeTx(42);
    await generateBookingReference(tx, new Date('2026-07-20T12:00:00+03:00'));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { yearMonth: '2607' },
        update: { lastSeq: { increment: 1 } },
      }),
    );
  });
});
