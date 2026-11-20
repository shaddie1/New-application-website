import { describe, expect, it } from 'vitest';

import type { ProjectSchedule } from '../projects/schedule.js';
import { MAX_PERIODS, billingPeriods, suggestedLines, type BillingProject } from './periods.js';

const once = (startDate: string | null, endDate: string | null = null): ProjectSchedule => ({
  kind: 'ONCE', startDate, endDate, repeatEvery: null, repeatUnit: null, serviceDays: [], weekOfMonth: null, deepCleanEveryMonths: null,
});

const weekends = (over: Partial<ProjectSchedule> = {}): ProjectSchedule => ({
  kind: 'REPEATING', startDate: '2026-11-20', endDate: null, repeatEvery: 1, repeatUnit: 'WEEK',
  serviceDays: [6, 7], weekOfMonth: null, deepCleanEveryMonths: null, ...over,
});

const project = (over: Partial<BillingProject>): BillingProject => ({
  title: 'Office contract', paymentFrequency: 'MONTHLY', valueCents: 1_250_000, deepCleanPriceCents: null,
  schedule: weekends(), ...over,
});

const spans = (p: BillingProject, upTo: string) => billingPeriods(p, upTo).map((x) => `${x.start}..${x.end} ${x.label}`);

describe('billingPeriods', () => {
  it('gives one period for a one-off job, start to end', () => {
    expect(spans(project({ paymentFrequency: 'ONE_OFF', schedule: once('2026-12-03') }), '2026-11-01'))
      .toEqual(['2026-12-03..2026-12-03 3 Dec 2026']);
    expect(spans(project({ paymentFrequency: 'ONE_OFF', schedule: once('2026-12-03', '2026-12-05') }), '2026-11-01'))
      .toEqual(['2026-12-03..2026-12-05 3–5 Dec 2026']);
  });

  it('gives calendar months up to today, the first clipped to the start', () => {
    expect(spans(project({}), '2027-01-10')).toEqual([
      '2026-11-20..2026-11-30 November 2026',
      '2026-12-01..2026-12-31 December 2026',
      '2027-01-01..2027-01-31 January 2027',
    ]);
  });

  it('stops at the contract end, clipping the last month', () => {
    expect(spans(project({ schedule: weekends({ endDate: '2026-12-15' }) }), '2027-06-01')).toEqual([
      '2026-11-20..2026-11-30 November 2026',
      '2026-12-01..2026-12-15 December 2026',
    ]);
  });

  it('gives Monday-to-Sunday weeks for weekly and daily rates', () => {
    expect(spans(project({ paymentFrequency: 'WEEKLY' }), '2026-12-01')).toEqual([
      '2026-11-20..2026-11-22 20–22 Nov 2026',
      '2026-11-23..2026-11-29 23–29 Nov 2026',
      '2026-11-30..2026-12-06 30 Nov – 6 Dec 2026',
    ]);
    expect(billingPeriods(project({ paymentFrequency: 'DAILY' }), '2026-11-24')).toHaveLength(2);
  });

  it('has nothing without a start date, and keeps only the newest periods', () => {
    expect(billingPeriods(project({ schedule: once(null) }), '2027-01-01')).toEqual([]);
    const long = billingPeriods(project({ paymentFrequency: 'WEEKLY', schedule: weekends({ startDate: '2020-01-06' }) }), '2026-11-20');
    expect(long).toHaveLength(MAX_PERIODS);
    expect(long[long.length - 1]!.start).toBe('2026-11-16');
  });
});

describe('suggestedLines', () => {
  const [nov, dec, jan, feb] = billingPeriods(project({}), '2027-02-28');

  it('charges the monthly rate for each month', () => {
    expect(suggestedLines(project({}), dec!)).toEqual([
      { description: 'Cleaning service, December 2026', quantity: 1, unitCents: 1_250_000, amountCents: 1_250_000 },
    ]);
    expect(nov && jan).toBeTruthy();
  });

  it('adds the deep clean at its own price in the month it falls in', () => {
    const p = project({ deepCleanPriceCents: 800_000, schedule: weekends({ deepCleanEveryMonths: 3 }) });
    // Started in November: the first deep clean is the first visit in February, Sat 6 Feb.
    expect(suggestedLines(p, jan!)).toHaveLength(1);
    expect(suggestedLines(p, feb!)).toEqual([
      { description: 'Cleaning service, February 2027', quantity: 1, unitCents: 1_250_000, amountCents: 1_250_000 },
      { description: 'Deep clean (6 Feb)', quantity: 1, unitCents: 800_000, amountCents: 800_000 },
    ]);
  });

  it('does not charge a skipped deep clean', () => {
    const p = project({ deepCleanPriceCents: 800_000, schedule: weekends({ deepCleanEveryMonths: 3 }) });
    expect(suggestedLines(p, feb!, new Set(['2027-02-06']))).toHaveLength(1);
  });

  it('charges a day rate for each service day not skipped', () => {
    const p = project({ paymentFrequency: 'DAILY', valueCents: 300_000 });
    const [, week] = billingPeriods(p, '2026-11-29');
    expect(suggestedLines(p, week!, new Set(['2026-11-29']))).toEqual([
      { description: 'Cleaning service, 1 day (23–29 Nov 2026)', quantity: 1, unitCents: 300_000, amountCents: 300_000 },
    ]);
  });

  it('charges the agreed value once for a one-off job, or zero when none was agreed', () => {
    const p = project({ paymentFrequency: 'ONE_OFF', valueCents: 4_500_000, title: 'Move-out clean', schedule: once('2026-12-03') });
    const [whole] = billingPeriods(p, '2026-12-01');
    expect(suggestedLines(p, whole!)).toEqual([
      { description: 'Move-out clean', quantity: 1, unitCents: 4_500_000, amountCents: 4_500_000 },
    ]);
    expect(suggestedLines({ ...p, valueCents: null }, whole!)[0]!.amountCents).toBe(0);
  });
});
