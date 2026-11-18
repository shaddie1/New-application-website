import { describe, expect, it } from 'vitest';

import { countsFromStartDay, potFigures, type PotInput } from './pot.js';

/** A date as the database gives a start day or a repair's date: midnight UTC. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** Whole shillings to cents. */
const ksh = (shillings: number) => shillings * 100;

const START = day('2026-06-01');
const AFTER_START = day('2026-07-15');

/** A machine priced KSh 260,000 that belongs to the company and has done nothing yet. */
const machine = (over: Partial<PotInput> = {}): PotInput => ({
  priceCents: ksh(260_000), startDay: START, lines: [], repairs: [], investors: [], payments: [], ...over,
});
const line = (shillings: number) => ({ amountCents: ksh(shillings) });
const repair = (shillings: number, date = AFTER_START) => ({ date, costCents: ksh(shillings) });
const amina = { id: 'inv1', name: 'Amina', contributionCents: ksh(156_000) };
const paid = (shillings: number, investorId = 'inv1') => ({ investorId, amountCents: ksh(shillings) });

/** AE3's machine: one investor put in 156,000 of 260,000; it earned 50,000 and had 10,000 of repairs. */
const ae3 = (over: Partial<PotInput> = {}) =>
  machine({ investors: [amina], lines: [line(30_000), line(20_000)], repairs: [repair(10_000)], ...over });

describe('potFigures', () => {
  it('AE3: a 60% investor is entitled to 24,000 of 50,000 earned less 10,000 of repairs, and the company keeps 16,000', () => {
    expect(potFigures(ae3())).toEqual({
      earnedCents: ksh(50_000),
      repairsCents: ksh(10_000),
      paidOutCents: 0,
      potCents: ksh(40_000),
      earnBackGapCents: ksh(220_000),
      paidForItself: false,
      companyShareBps: 4000,
      companyPartCents: ksh(16_000),
      investors: [{
        investorId: 'inv1', name: 'Amina', contributionCents: ksh(156_000), shareBps: 6000,
        entitledCents: ksh(24_000), paidCents: 0, owedCents: ksh(24_000), overpaidCents: 0,
      }],
    });
  });

  it('AE3: after a 20,000 payment the investor is owed 4,000 and the pot holds 20,000', () => {
    const figures = potFigures(ae3({ payments: [paid(20_000)] }));

    expect(figures).toMatchObject({
      earnedCents: ksh(50_000), repairsCents: ksh(10_000), paidOutCents: ksh(20_000), potCents: ksh(20_000),
      // A payment is not a repair: the machine is no further from earning back its price.
      earnBackGapCents: ksh(220_000), companyPartCents: ksh(16_000),
    });
    expect(figures.investors).toEqual([{
      investorId: 'inv1', name: 'Amina', contributionCents: ksh(156_000), shareBps: 6000,
      entitledCents: ksh(24_000), paidCents: ksh(20_000), owedCents: ksh(4_000), overpaidCents: 0,
    }]);
  });

  it('AE12: one more 10,000 repair after that payment leaves the investor entitled to 18,000 and overpaid by 2,000', () => {
    const figures = potFigures(ae3({ payments: [paid(20_000)], repairs: [repair(10_000), repair(10_000)] }));

    expect(figures).toMatchObject({
      repairsCents: ksh(20_000), paidOutCents: ksh(20_000), potCents: ksh(10_000),
      earnBackGapCents: ksh(230_000), companyPartCents: ksh(12_000),
    });
    expect(figures.investors[0]).toMatchObject({
      entitledCents: ksh(18_000), paidCents: ksh(20_000), owedCents: 0, overpaidCents: ksh(2_000),
    });
  });

  it('AE13: a repair dated before the start day changes no figure', () => {
    const today = day('2026-11-17');
    const lastYear = repair(15_000, day('2025-11-20'));

    expect(potFigures(machine({ startDay: today, repairs: [lastYear] }))).toEqual({
      earnedCents: 0, repairsCents: 0, paidOutCents: 0, potCents: 0,
      earnBackGapCents: ksh(260_000), paidForItself: false,
      companyShareBps: 10_000, companyPartCents: 0, investors: [],
    });
    expect(potFigures(ae3({ repairs: [repair(10_000), lastYear] }))).toEqual(potFigures(ae3()));
  });

  it('counts a repair dated on the start day and leaves out one dated the day before', () => {
    const figures = potFigures(machine({
      lines: [line(50_000)],
      repairs: [repair(3_000, day('2026-05-31')), repair(4_000, day('2026-06-01'))],
    }));

    expect(figures.repairsCents).toBe(ksh(4_000));
    expect(figures.potCents).toBe(ksh(46_000));
    expect(countsFromStartDay(day('2026-05-31'), START)).toBe(false);
    expect(countsFromStartDay(day('2026-06-01'), START)).toBe(true);
  });

  it('AE7: a company machine that earned 270,000 on a price of 260,000 has paid for itself and is 10,000 ahead', () => {
    expect(potFigures(machine({ lines: [line(200_000), line(70_000)] }))).toEqual({
      earnedCents: ksh(270_000), repairsCents: 0, paidOutCents: 0, potCents: ksh(270_000),
      earnBackGapCents: ksh(-10_000), paidForItself: true,
      companyShareBps: 10_000, companyPartCents: ksh(270_000), investors: [],
    });
  });

  it('has paid for itself once it has earned exactly its price plus its repairs, and not a shilling before', () => {
    const short = potFigures(machine({ lines: [line(264_950)], repairs: [repair(5_000)] }));
    const exact = potFigures(machine({ lines: [line(265_000)], repairs: [repair(5_000)] }));

    expect(short).toMatchObject({ earnBackGapCents: ksh(50), paidForItself: false });
    expect(exact).toMatchObject({ earnBackGapCents: 0, paidForItself: true });
  });

  it('rounds each of three uneven entitlements down to the cent and gives the company the remainder', () => {
    // 2/9, 3/9 and 4/9 of a KSh 90,000 machine, sharing 150,000 - 49,996 = 100,004 cents.
    const figures = potFigures(machine({
      priceCents: 9_000_000,
      investors: [
        { id: 'a', name: 'Amina', contributionCents: 2_000_000 },
        { id: 'b', name: 'Baraka', contributionCents: 3_000_000 },
        { id: 'c', name: 'Chebet', contributionCents: 4_000_000 },
      ],
      lines: [{ amountCents: 150_000 }],
      repairs: [{ date: AFTER_START, costCents: 49_996 }],
    }));

    // 22,223.11, 33,334.67 and 44,446.22 before rounding.
    expect(figures.investors.map((i) => i.entitledCents)).toEqual([22_223, 33_334, 44_446]);
    expect(figures.investors.map((i) => i.shareBps)).toEqual([2222, 3333, 4444]);
    expect(figures.companyShareBps).toBe(0);
    expect(figures.companyPartCents).toBe(1);
    expect(22_223 + 33_334 + 44_446 + figures.companyPartCents).toBe(150_000 - 49_996);
  });

  it('stays right to the cent when the sums are too large for ordinary multiplication', () => {
    // 2,967,900,000 x 389,999,900 / 390,000,000 is 2,967,899,239 exactly; floating point gives one cent less.
    const figures = potFigures(machine({
      priceCents: 390_000_000,
      investors: [{ id: 'a', name: 'Amina', contributionCents: 389_999_900 }],
      lines: [{ amountCents: 989_300_000 }, { amountCents: 989_300_000 }, { amountCents: 989_300_000 }],
    }));

    expect(figures.investors[0]?.entitledCents).toBe(2_967_899_239);
    expect(figures.companyPartCents).toBe(761);
  });

  it('repairs larger than earnings with nothing paid: the pot is negative, and the investor is neither owed nor overpaid', () => {
    const figures = potFigures(ae3({ lines: [line(5_000)] }));

    expect(figures).toMatchObject({
      earnedCents: ksh(5_000), repairsCents: ksh(10_000), potCents: ksh(-5_000),
      earnBackGapCents: ksh(265_000), paidForItself: false, companyPartCents: ksh(-2_000),
    });
    // The share of the shortfall is kept so the parts still add up to the pot.
    expect(figures.investors[0]).toMatchObject({
      entitledCents: ksh(-3_000), paidCents: 0, owedCents: 0, overpaidCents: 0,
    });
  });

  it('repairs larger than earnings after a 5,000 payment: overpaid by 5,000, never by more than was paid', () => {
    const figures = potFigures(ae3({ lines: [line(5_000)], payments: [paid(5_000)] }));

    expect(figures).toMatchObject({ paidOutCents: ksh(5_000), potCents: ksh(-10_000) });
    expect(figures.investors[0]).toMatchObject({
      entitledCents: ksh(-3_000), paidCents: ksh(5_000), owedCents: 0, overpaidCents: ksh(5_000),
    });
  });

  it('adds up each investor\'s own payments', () => {
    const figures = potFigures(machine({
      investors: [amina, { id: 'inv2', name: 'Baraka', contributionCents: ksh(52_000) }],
      lines: [line(50_000)],
      payments: [paid(10_000), paid(4_000, 'inv2'), paid(5_000)],
    }));

    expect(figures.paidOutCents).toBe(ksh(19_000));
    expect(figures.potCents).toBe(ksh(31_000));
    expect(figures.investors.map((i) => [i.name, i.shareBps, i.entitledCents, i.paidCents, i.owedCents])).toEqual([
      ['Amina', 6000, ksh(30_000), ksh(15_000), ksh(15_000)],
      ['Baraka', 2000, ksh(10_000), ksh(4_000), ksh(6_000)],
    ]);
    expect(figures.companyShareBps).toBe(2000);
    expect(figures.companyPartCents).toBe(ksh(10_000));
  });

  it('no investors: the company\'s part is the whole pot', () => {
    expect(potFigures(machine({ lines: [line(50_000)], repairs: [repair(10_000)] }))).toEqual({
      earnedCents: ksh(50_000), repairsCents: ksh(10_000), paidOutCents: 0, potCents: ksh(40_000),
      earnBackGapCents: ksh(220_000), paidForItself: false,
      companyShareBps: 10_000, companyPartCents: ksh(40_000), investors: [],
    });
  });

  it('price 0: no shares are computed, and it has not paid for itself until it has earned something', () => {
    const noPrice = (over: Partial<PotInput> = {}) => machine({ priceCents: 0, investors: [amina], ...over });

    expect(potFigures(noPrice())).toEqual({
      earnedCents: 0, repairsCents: 0, paidOutCents: 0, potCents: 0,
      earnBackGapCents: 0, paidForItself: false,
      companyShareBps: 10_000, companyPartCents: 0,
      investors: [{
        investorId: 'inv1', name: 'Amina', contributionCents: ksh(156_000), shareBps: 0,
        entitledCents: 0, paidCents: 0, owedCents: 0, overpaidCents: 0,
      }],
    });
    expect(potFigures(noPrice({ lines: [line(4_000)] }))).toMatchObject({
      earnBackGapCents: ksh(-4_000), paidForItself: true, companyPartCents: ksh(4_000),
      investors: [{ shareBps: 0, entitledCents: 0, owedCents: 0 }],
    });
  });
});
