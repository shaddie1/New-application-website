import { describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({ prisma: {} }));

import { daysText, machineDaysRefusal, suggestMachineDays, type ListedMachine } from './machineDays.js';

const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const scrubber: ListedMachine = {
  assetId: 'm1', name: 'Scrubber', halfDaysPerVisit: 1, projectRateCents: 50_000, countsFrom: day('2026-01-01'), retiredAt: null,
};

describe('suggestMachineDays', () => {
  it('suggests done visits times half days per visit', () => {
    const vacuum = { ...scrubber, assetId: 'm2', name: 'Vacuum', halfDaysPerVisit: 2, projectRateCents: 20_000 };

    expect(suggestMachineDays([scrubber, vacuum], 4)).toEqual({
      doneVisits: 4,
      suggestions: [
        { assetId: 'm1', name: 'Scrubber', rateCents: 50_000, halfDaysPerVisit: 1, halfDays: 4 },
        { assetId: 'm2', name: 'Vacuum', rateCents: 20_000, halfDaysPerVisit: 2, halfDays: 8 },
      ],
    });
  });

  it('leaves out a retired machine and one taken off the register', () => {
    const retired = { ...scrubber, assetId: 'm2', retiredAt: day('2026-06-01') };
    const offRegister = { ...scrubber, assetId: 'm3', projectRateCents: null, countsFrom: null };

    expect(suggestMachineDays([retired, offRegister], 3).suggestions).toEqual([]);
  });
});

describe('machineDaysRefusal', () => {
  const machine = { id: 'm1', name: 'Scrubber', projectRateCents: 50_000, countsFrom: day('2026-11-10'), retiredAt: null };

  it('accepts days on a machine counting by the paid day', () => {
    expect(machineDaysRefusal([{ assetId: 'm1', halfDays: 4 }], [machine], day('2026-11-10'))).toBeNull();
  });

  it('refuses a machine listed twice, one not on the register, a retired one, and a paid day before the start day', () => {
    expect(machineDaysRefusal([{ assetId: 'm1', halfDays: 1 }, { assetId: 'm1', halfDays: 1 }], [machine], day('2026-11-20')))
      .toBe('Each machine can be listed once.');
    expect(machineDaysRefusal([{ assetId: 'zz', halfDays: 1 }], [machine], day('2026-11-20'))).toMatch(/not on the machine register/);
    expect(machineDaysRefusal([{ assetId: 'm1', halfDays: 1 }], [{ ...machine, retiredAt: day('2026-11-15') }], day('2026-11-20')))
      .toMatch(/Scrubber is retired/);
    expect(machineDaysRefusal([{ assetId: 'm1', halfDays: 1 }], [machine], day('2026-11-09'))).toMatch(/start day is 10 Nov 2026/);
  });
});

describe('daysText', () => {
  it('says the days plainly', () => {
    expect([1, 2, 3, 4].map(daysText)).toEqual(['half a day', '1 day', '1.5 days', '2 days']);
  });
});
