import { describe, expect, it } from 'vitest';
import type { DeclaredPeriodDto } from '@onyxhawk/types';

import {
  amountPreview,
  blankInvestorRow,
  daysAmountCents,
  declaredPeriodWarning,
  fieldDays,
  fieldShillings,
  hireAmountPreview,
  hireRateWarning,
  investorRowsFor,
  machineChanges,
  nairobiDay,
  oldHireChange,
  oldHireOpeningRate,
  overlapWarning,
  parseAmount,
  parseDays,
  parsePayment,
  parsePrice,
  parseRate,
  readInvestorsForm,
  registerHasTwoRates,
  startDayProblem,
  usualRateHint,
  type InvestorRow,
} from './forms';

describe('parseRate', () => {
  it('reads whole shillings as cents', () => {
    expect(parseRate('2000')).toEqual({ ok: true, cents: 200_000 });
    expect(parseRate(' 2500 ')).toEqual({ ok: true, cents: 250_000 });
  });

  it.each([
    ['2000.50', 'A daily rate is in whole shillings, with no cents.'],
    ['0', 'A daily rate must be more than KSh 0.'],
    ['-5', 'A daily rate cannot be negative.'],
    ['abc', 'Enter a number, such as 2000.'],
    ['', 'Enter a daily rate.'],
  ])('refuses "%s" and says why', (typed, reason) => {
    expect(parseRate(typed)).toEqual({ ok: false, reason });
  });

  describe.each([
    ['project rate', 'A project rate'],
    ['hire rate', 'A hire rate'],
  ] as const)('as the %s field (R1)', (rate, named) => {
    it('accepts "3500"', () => {
      expect(parseRate('3500', rate)).toEqual({ ok: true, cents: 350_000 });
    });

    it.each([
      ['3500.50', `${named} is in whole shillings, with no cents.`],
      ['0', `${named} must be more than KSh 0.`],
      ['-5', `${named} cannot be negative.`],
      ['', `Enter a ${rate}.`],
    ])('refuses "%s" with its own message', (typed, reason) => {
      expect(parseRate(typed, rate)).toEqual({ ok: false, reason });
    });
  });
});

describe('hireRateWarning (R4)', () => {
  // AE4: a project rate of KSh 2,000.
  it('warns when the hire rate is below the project rate', () => {
    expect(hireRateWarning(200_000, 150_000)).toBe('Hire rate is usually higher than the project rate — continue?');
  });

  it('says nothing when the hire rate is the project rate or above it', () => {
    expect(hireRateWarning(200_000, 200_000)).toBeNull();
    expect(hireRateWarning(200_000, 350_000)).toBeNull();
  });
});

describe('registerHasTwoRates (KTD6)', () => {
  const row = { id: 'm1', name: 'Scrubber', projectRateCents: 200_000, hireRateCents: 350_000, dailyRateCents: 200_000 };
  // A machine as the API sent it before the two rates.
  const oldRow = { id: 'm2', name: 'Polisher', dailyRateCents: 150_000 };

  it('passes a register whose machines each carry a project rate', () => {
    expect(registerHasTwoRates({ machines: [row, { ...row, id: 'm2' }] })).toBe(true);
  });

  it('fails a register from the older API, whose machines carry only the one daily rate', () => {
    expect(registerHasTwoRates({ machines: [oldRow] })).toBe(false);
  });

  it('fails when any machine has no project rate', () => {
    expect(registerHasTwoRates({ machines: [row, oldRow] })).toBe(false);
  });

  it('passes an empty register: there is nothing to tell the two APIs apart by', () => {
    expect(registerHasTwoRates({ machines: [] })).toBe(true);
  });
});

describe('parseAmount', () => {
  it('reads shillings and cents digit by digit', () => {
    expect(parseAmount('5000')).toEqual({ ok: true, cents: 500_000 });
    expect(parseAmount('1234.56')).toEqual({ ok: true, cents: 123_456 });
    expect(parseAmount('1234.5')).toEqual({ ok: true, cents: 123_450 });
    // 4.35 x 100 is 434.99999999999994 as a fraction; read by its digits it is 435.
    expect(parseAmount('4.35')).toEqual({ ok: true, cents: 435 });
  });

  it.each([
    ['', 'Enter an amount.'],
    ['0', 'The amount must be more than KSh 0.'],
    ['-5', 'An amount cannot be negative.'],
    ['abc', 'Enter a number, such as 1500 or 1500.50.'],
    ['10.555', 'An amount can have at most two decimal places.'],
  ])('refuses "%s" and says why', (typed, reason) => {
    expect(parseAmount(typed)).toEqual({ ok: false, reason });
  });

  it('takes 0 where nothing is a real amount, and still wants something typed', () => {
    expect(parseAmount('0', { orZero: true })).toEqual({ ok: true, cents: 0 });
    expect(parseAmount('', { orZero: true })).toEqual({ ok: false, reason: 'Enter an amount.' });
  });
});

describe('parsePrice', () => {
  it('reads a price, and a blank or 0 as no price', () => {
    expect(parsePrice('260000')).toEqual({ ok: true, cents: 26_000_000 });
    expect(parsePrice('')).toEqual({ ok: true, cents: 0 });
    expect(parsePrice('0')).toEqual({ ok: true, cents: 0 });
  });

  it('refuses what is not an amount', () => {
    expect(parsePrice('abc')).toEqual({ ok: false, reason: 'Enter a number, such as 1500 or 1500.50.' });
    expect(parsePrice('-1')).toEqual({ ok: false, reason: 'An amount cannot be negative.' });
  });
});

describe('parsePayment', () => {
  // AE3: an investor still owed KSh 4,000.
  it('accepts a payment up to what is still owed', () => {
    expect(parsePayment('4000', 400_000)).toEqual({ ok: true, cents: 400_000 });
    expect(parsePayment('1500.50', 400_000)).toEqual({ ok: true, cents: 150_050 });
  });

  it('refuses a payment above what is still owed', () => {
    expect(parsePayment('5000', 400_000)).toEqual({
      ok: false,
      reason: 'That is more than the KSh 4,000 still owed.',
    });
  });

  it('refuses what is not an amount', () => {
    expect(parsePayment('0', 400_000)).toEqual({ ok: false, reason: 'The amount must be more than KSh 0.' });
  });
});

describe('parseDays', () => {
  it.each([
    ['2.5', 5],
    ['2', 4],
    ['0.5', 1],
    ['1.0', 2],
    ['1.50', 3],
  ])('reads "%s" as %i half days', (typed, halfDays) => {
    expect(parseDays(typed)).toEqual({ ok: true, halfDays });
  });

  it.each([
    ['2.25', 'Days are counted in halves, such as 2 or 2.5.'],
    ['0', 'Days must be more than 0.'],
    ['', 'Enter the days.'],
    ['-1', 'Days cannot be negative.'],
    ['two', 'Enter a number, such as 1, 2.5 or 0.5.'],
  ])('refuses "%s" and says why', (typed, reason) => {
    expect(parseDays(typed)).toEqual({ ok: false, reason });
  });
});

describe('what a field starts with', () => {
  it('writes cents as shillings without "KSh"', () => {
    expect(fieldShillings(200_000)).toBe('2000');
    expect(fieldShillings(150_050)).toBe('1500.50');
    expect(fieldShillings(0)).toBe('');
  });

  it('writes half days as days', () => {
    expect(fieldDays(5)).toBe('2.5');
    expect(fieldDays(4)).toBe('2');
  });
});

describe('the amount shown before saving', () => {
  it('is days x the daily rate', () => {
    // 2.5 days at KSh 2,000 a day.
    expect(daysAmountCents(5, 200_000)).toBe(500_000);
    expect(amountPreview('2.5', 200_000)).toBe('2.5 days at KSh 2,000 a day: KSh 5,000');
    expect(amountPreview('1', 200_000)).toBe('1 day at KSh 2,000 a day: KSh 2,000');
  });

  it('is not shown while the days cannot be read', () => {
    expect(amountPreview('', 200_000)).toBeNull();
    expect(amountPreview('2.25', 200_000)).toBeNull();
  });
});

describe('hireAmountPreview (R8)', () => {
  it('reads 2 days at KSh 3,500 as KSh 7,000, charged to the client and all of it into the pot', () => {
    expect(hireAmountPreview('2', 350_000)).toBe(
      '2 days at KSh 3,500 a day: KSh 7,000. The client is charged this, and all of it goes into the pot.',
    );
  });

  it('is not shown while the days cannot be read', () => {
    expect(hireAmountPreview('', 350_000)).toBeNull();
  });
});

describe('usualRateHint (R7)', () => {
  it('names the usual rate', () => {
    expect(usualRateHint(parseRate('2000'), 200_000)).toBe('Usual rate KSh 2,000');
  });

  it('says so when the typed rate differs from it', () => {
    expect(usualRateHint(parseRate('1500'), 200_000)).toBe(
      'Usual rate KSh 2,000. This rate is different, so the record will show both.',
    );
  });

  it('names only the usual rate while the typed rate cannot be read', () => {
    expect(usualRateHint(parseRate(''), 200_000)).toBe('Usual rate KSh 2,000');
  });
});

describe('overlapWarning (R13, KTD7)', () => {
  // AE8: a hire to Jane Wanjiru from 10 November for 3 days, ending 12 November.
  const janeHire = {
    id: 'h1', isHire: true, date: '2026-11-10', halfDays: 6, jobTitle: 'Hire: Floor scrubber', customerName: 'Jane Wanjiru',
  };
  const janeOverlap =
    'These dates overlap the hire to Jane Wanjiru, 10 Nov 2026 to 12 Nov 2026. You can still save.';

  it('AE8: a second hire starting on its last day overlaps it and names it', () => {
    expect(overlapWarning({ date: '2026-11-12', halfDays: 4 }, [janeHire])).toBe(janeOverlap);
  });

  it('a hire starting the day after it ends does not overlap it', () => {
    expect(overlapWarning({ date: '2026-11-13', halfDays: 4 }, [janeHire])).toBeNull();
  });

  it('days on a job dated 11 November overlap it, and the job is named the other way round', () => {
    expect(overlapWarning({ date: '2026-11-11', halfDays: 2 }, [janeHire])).toBe(janeOverlap);
    const mallDays = { id: 'd1', isHire: false, date: '2026-11-11', halfDays: 2, jobTitle: 'Mall deep clean' };
    expect(overlapWarning({ date: '2026-11-10', halfDays: 6 }, [mallDays])).toBe(
      'These dates overlap 1 day on “Mall deep clean”, dated 11 Nov 2026. You can still save.',
    );
  });

  it('a hire being edited does not overlap itself', () => {
    expect(overlapWarning({ id: 'h1', date: '2026-11-11', halfDays: 6 }, [janeHire])).toBeNull();
  });

  it('two half-day records on one date do not overlap; a half day against a full day on that date does', () => {
    const morning = { id: 'd2', isHire: false, date: '2026-11-20', halfDays: 1, jobTitle: 'Clinic floor strip' };
    expect(overlapWarning({ date: '2026-11-20', halfDays: 1 }, [morning])).toBeNull();
    expect(overlapWarning({ date: '2026-11-20', halfDays: 2 }, [morning])).toBe(
      'These dates overlap 0.5 days on “Clinic floor strip”, dated 20 Nov 2026. You can still save.',
    );
  });

  it('the half day that ends a record shares its date with another half day', () => {
    // 2.5 days from 10 November: the 12th is a half day.
    const shorter = { ...janeHire, halfDays: 5 };
    expect(overlapWarning({ date: '2026-11-12', halfDays: 1 }, [shorter])).toBeNull();
    expect(overlapWarning({ date: '2026-11-12', halfDays: 2 }, [shorter])).not.toBeNull();
  });

  it('names every record it overlaps, and a hire whose client the viewer was not sent', () => {
    const mallDays = { id: 'd1', isHire: false, date: '2026-11-11', halfDays: 2, jobTitle: 'Mall deep clean' };
    const unnamed = { id: 'h1', isHire: true, date: '2026-11-10', halfDays: 6, jobTitle: 'Hire' };
    expect(overlapWarning({ date: '2026-11-10', halfDays: 4 }, [unnamed, mallDays])).toBe(
      'These dates overlap a hire, 10 Nov 2026 to 12 Nov 2026 and 1 day on “Mall deep clean”, dated 11 Nov 2026. You can still save.',
    );
  });

  it('says nothing while the date is not chosen', () => {
    expect(overlapWarning({ date: '', halfDays: 2 }, [janeHire])).toBeNull();
  });
});

describe('an older hire\'s change of days or rate (R10)', () => {
  // AE7: 3 days charged KSh 10,500, with a machine amount of KSh 6,000.
  const oldHire = { chargedCents: 1_050_000, amountCents: 600_000, halfDays: 6 };

  it('AE7: opens at the charge over the days, KSh 3,500 a day', () => {
    expect(oldHireOpeningRate(oldHire)).toBe('3500');
  });

  it('opens blank when the charge over the days is not whole shillings', () => {
    expect(oldHireOpeningRate({ ...oldHire, chargedCents: 1_000_000 })).toBe('');
  });

  it('opens blank for a hire charged nothing', () => {
    expect(oldHireOpeningRate({ ...oldHire, chargedCents: 0 })).toBe('');
  });

  it('AE7: the machine\'s amount goes from KSh 6,000 to KSh 10,500, and the job\'s profit from KSh 4,500 to nothing', () => {
    expect(oldHireChange(oldHire, 6, 350_000)).toEqual({
      before: { chargedCents: 1_050_000, machineCents: 600_000, profitCents: 450_000 },
      after: { chargedCents: 1_050_000, machineCents: 1_050_000, profitCents: 0 },
    });
  });

  it('charges the new days at the new rate', () => {
    expect(oldHireChange(oldHire, 4, 300_000).after).toEqual({ chargedCents: 600_000, machineCents: 600_000, profitCents: 0 });
  });
});

describe('declaredPeriodWarning', () => {
  const october: DeclaredPeriodDto = { label: 'October 2026', periodStart: '2026-10-01', periodEnd: '2026-10-31' };

  // AE16.
  it('names the payout when the date is inside its period', () => {
    expect(declaredPeriodWarning('2026-10-14', [october])).toBe(
      'The payout “October 2026” is already declared, on the higher profit: this amount had not come off it. ' +
        'You can still save. The declared payout does not change.',
    );
  });

  it('counts the first and the last day of the period', () => {
    expect(declaredPeriodWarning('2026-10-01', [october])).not.toBeNull();
    expect(declaredPeriodWarning('2026-10-31', [october])).not.toBeNull();
  });

  it('says nothing outside every declared period', () => {
    expect(declaredPeriodWarning('2026-11-01', [october])).toBeNull();
    expect(declaredPeriodWarning('2026-09-30', [october])).toBeNull();
    expect(declaredPeriodWarning('2026-10-14', [])).toBeNull();
    expect(declaredPeriodWarning('', [october])).toBeNull();
  });

  it('names every payout the date is inside', () => {
    const quarter: DeclaredPeriodDto = { label: 'Q4 2026', periodStart: '2026-10-01', periodEnd: '2026-12-31' };
    expect(declaredPeriodWarning('2026-10-14', [october, quarter])).toBe(
      'The payouts “October 2026” and “Q4 2026” are already declared, on the higher profit: this amount had not come off them. ' +
        'You can still save. The declared payouts do not change.',
    );
  });
});

describe('nairobiDay', () => {
  it('reads the day from the Nairobi calendar, not the UTC one', () => {
    // 22:00 UTC on 31 October is 01:00 on 1 November in Nairobi.
    expect(nairobiDay(new Date('2026-10-31T22:00:00Z'))).toBe('2026-11-01');
    expect(nairobiDay(new Date('2026-10-31T20:59:00Z'))).toBe('2026-10-31');
  });
});

describe('startDayProblem', () => {
  it('accepts today and earlier days', () => {
    expect(startDayProblem('2026-11-17', '2026-11-17')).toBeNull();
    expect(startDayProblem('2026-10-01', '2026-11-17')).toBeNull();
  });

  it('refuses a day in the future, and no day at all', () => {
    expect(startDayProblem('2026-11-18', '2026-11-17')).toBe('The start day cannot be in the future.');
    expect(startDayProblem('', '2026-11-17')).toBe('Choose a start day.');
  });
});

describe('machineChanges', () => {
  const fields = {
    name: 'Scrubber', priceCents: 26_000_000, projectRateCents: 200_000, hireRateCents: 350_000, startDay: '2026-11-01',
  };

  describe('for a machine whose hire rate is reviewed', () => {
    const machine = { ...fields, hireRateReviewed: true };

    it('sends only what was changed', () => {
      expect(machineChanges(machine, { ...fields, projectRateCents: 250_000 })).toEqual({ projectRateCents: 250_000 });
      expect(machineChanges(machine, { ...fields, hireRateCents: 400_000 })).toEqual({ hireRateCents: 400_000 });
      expect(machineChanges(machine, { ...fields, name: 'Floor scrubber', startDay: '2026-10-01' })).toEqual({
        name: 'Floor scrubber',
        startDay: '2026-10-01',
      });
    });

    it('is null when nothing was changed', () => {
      expect(machineChanges(machine, { ...fields })).toBeNull();
    });
  });

  describe('for a machine whose hire rate is not reviewed (R3, AE3)', () => {
    // Both rates are its one rate from before the hire rate came in.
    const flagged = { ...fields, hireRateCents: 200_000, hireRateReviewed: false };
    const typed = { ...fields, hireRateCents: 200_000 };

    it('can be saved with nothing changed, and confirms both rates as they stand', () => {
      expect(machineChanges(flagged, typed)).toEqual({ projectRateCents: 200_000, hireRateCents: 200_000, ratesReviewed: true });
    });

    it('sends the new hire rate with the marker', () => {
      expect(machineChanges(flagged, { ...typed, hireRateCents: 350_000 })).toEqual({
        projectRateCents: 200_000, hireRateCents: 350_000, ratesReviewed: true,
      });
    });

    it('sends the marker with every save, a change of name included', () => {
      expect(machineChanges(flagged, { ...typed, name: 'Floor scrubber' })).toEqual({
        name: 'Floor scrubber', projectRateCents: 200_000, hireRateCents: 200_000, ratesReviewed: true,
      });
    });
  });
});

describe('readInvestorsForm', () => {
  /** AE3's machine: priced KSh 260,000, one investor who put in KSh 156,000. */
  const stored = [{ id: 'i1', name: 'Amina Yusuf', contributionCents: 15_600_000 }];
  const machine = (over: { earnedCents?: number; investors?: typeof stored } = {}) => ({
    priceCents: 26_000_000,
    earnedCents: 0,
    investors: stored,
    ...over,
  });
  const row = (key: string, name: string, amount: string): InvestorRow => ({ key, name, amount });

  it('opens with one row per investor, at what each put in', () => {
    expect(investorRowsFor(stored)).toEqual([{ key: 'i1', name: 'Amina Yusuf', amount: '156000' }]);
    expect(blankInvestorRow('new-1')).toEqual({ key: 'new-1', name: '', amount: '' });
  });

  it('previews each share of the price, and what is left for the company', () => {
    const form = readInvestorsForm(machine({ investors: [] }), [row('a', 'Amina Yusuf', '156000')]);
    expect(form.shares).toEqual({ a: '60%' });
    expect(form.totalCents).toBe(15_600_000);
    expect(form.companyLine).toBe('The company keeps the other 40% (KSh 104,000 of the price).');
    expect(form.blockedReason).toBeNull();
    expect(form.input).toEqual({ investors: [{ name: 'Amina Yusuf', contributionCents: 15_600_000 }] });
  });

  it('says so when investors cover the whole price, and when there are none', () => {
    expect(readInvestorsForm(machine({ investors: [] }), [row('a', 'Amina', '260000')]).companyLine).toBe(
      'The investors cover the whole price. The company has no share.',
    );
    expect(readInvestorsForm(machine(), []).companyLine).toBe('With no investors the machine is the company’s alone.');
  });

  it('refuses investors who total more than the price, before sending', () => {
    const form = readInvestorsForm(machine({ investors: [] }), [
      row('a', 'Amina Yusuf', '156000'),
      row('b', 'Brian Otieno', '110000'),
    ]);
    expect(form.totalCents).toBe(26_600_000);
    expect(form.blockedReason).toBe(
      'The investors’ amounts come to KSh 266,000, which is KSh 6,000 more than the price (KSh 260,000).',
    );
    expect(form.input).toBeNull();
  });

  it('marks a row with no name or an amount it cannot read', () => {
    const form = readInvestorsForm(machine({ investors: [] }), [row('a', '  ', '156000'), row('b', 'Brian Otieno', 'lots')]);
    expect(form.problems).toEqual({
      a: { name: 'Enter a name.' },
      b: { amount: 'Enter a number, such as 1500 or 1500.50.' },
    });
    expect(form.shares).toEqual({ a: '60%' });
    expect(form.blockedReason).toBe('Correct the rows marked above.');
    expect(form.input).toBeNull();
  });

  it('has nothing to save while the rows are the stored investors', () => {
    const form = readInvestorsForm(machine(), investorRowsFor(stored));
    expect(form.blockedReason).toBe('No changes to save.');
    expect(form.input).toBeNull();
    expect(form.warning).toBeNull();
  });

  it('can make the machine the company’s alone by removing every row', () => {
    const form = readInvestorsForm(machine(), []);
    expect(form.blockedReason).toBeNull();
    expect(form.input).toEqual({ investors: [] });
  });

  describe('on a machine that has already earned (R28)', () => {
    const earned = machine({ earnedCents: 5_000_000 });
    const warning =
      'This machine has already earned KSh 50,000. The new shares apply to all of it, not only to what it earns from now on.';

    it('warns when an amount is changed', () => {
      expect(readInvestorsForm(earned, [row('i1', 'Amina Yusuf', '130000')]).warning).toBe(warning);
    });

    it('warns when an investor is added or removed', () => {
      expect(readInvestorsForm(earned, [...investorRowsFor(stored), row('b', 'Brian Otieno', '52000')]).warning).toBe(warning);
      expect(readInvestorsForm(earned, []).warning).toBe(warning);
    });

    it('does not warn while nothing is changed', () => {
      expect(readInvestorsForm(earned, investorRowsFor(stored)).warning).toBeNull();
    });

    it('does not warn while the form cannot be saved', () => {
      expect(readInvestorsForm(earned, [row('i1', 'Amina Yusuf', '300000')]).warning).toBeNull();
    });
  });

  it('does not warn on a machine that has earned nothing', () => {
    expect(readInvestorsForm(machine(), [row('i1', 'Amina Yusuf', '130000')]).warning).toBeNull();
  });

  it('takes no investors for a machine with no price', () => {
    const form = readInvestorsForm({ priceCents: 0, earnedCents: 0, investors: [] }, [row('a', 'Amina Yusuf', '1000')]);
    expect(form.shares).toEqual({});
    expect(form.blockedReason).toBe('A machine with no price has no investors. Give it a price first.');
    expect(form.input).toBeNull();
  });
});
