import { describe, expect, it } from 'vitest';

import type { Block } from './block-state';
import {
  nextMonthTargets,
  overviewTargets,
  parseTargetsForm,
  targetsFormFields,
  targetsState,
  targetsView,
  type TargetValues,
} from './targets';

const targets = (revenueCents: number, netProfitCents: number, jobs: number): TargetValues => ({
  revenueCents, netProfitCents, jobs,
});

describe('targetsState', () => {
  it('reports "none" when the month has no record', () => {
    expect(targetsState(null)).toBe('none');
  });

  it('reports "none" when all three targets are zero', () => {
    expect(targetsState(targets(0, 0, 0))).toBe('none');
  });

  it('reports "some" for revenue 400,000, net profit 0 and jobs 12', () => {
    expect(targetsState(targets(40_000_000, 0, 12))).toBe('some');
  });

  it('reports "some" when a single target is set', () => {
    expect(targetsState(targets(0, 0, 12))).toBe('some');
  });

  it('reports "all" when every target is set', () => {
    expect(targetsState(targets(40_000_000, 12_000_000, 12))).toBe('all');
  });
});

describe('overviewTargets', () => {
  const progress = (target: number) => ({ actual: 0, target, percent: 0 });

  it('reads the three targets from an overview', () => {
    expect(
      overviewTargets({ hasTargets: true, revenue: progress(40_000_000), netProfit: progress(0), jobs: progress(12) }),
    ).toEqual(targets(40_000_000, 0, 12));
  });

  it('is null when the month has no record', () => {
    expect(
      overviewTargets({ hasTargets: false, revenue: progress(0), netProfit: progress(0), jobs: progress(0) }),
    ).toBeNull();
  });
});

// The month does not come into it: a past month with no targets is prompted
// for as the current one is, and a past month's targets can still be edited.
describe('targetsView', () => {
  it('prompts for targets when there are none and the viewer may set them', () => {
    expect(targetsView({ values: null, canSetTargets: true })).toEqual({ kind: 'prompt' });
    expect(targetsView({ values: targets(0, 0, 0), canSetTargets: true })).toEqual({ kind: 'prompt' });
  });

  it('never prompts a viewer who may not set targets', () => {
    expect(targetsView({ values: null, canSetTargets: false })).toEqual({ kind: 'read-only' });
    expect(targetsView({ values: targets(0, 0, 0), canSetTargets: false })).toEqual({ kind: 'read-only' });
  });

  it('shows rings for the targets that are set, and marks the one that is not', () => {
    expect(targetsView({ values: targets(40_000_000, 0, 12), canSetTargets: true })).toEqual({
      kind: 'rings',
      set: { revenue: true, netProfit: false, jobs: true },
      canEdit: true,
    });
  });

  it('shows the rings without the edit link to a viewer who may not set targets', () => {
    expect(targetsView({ values: targets(40_000_000, 12_000_000, 12), canSetTargets: false })).toEqual({
      kind: 'rings',
      set: { revenue: true, netProfit: true, jobs: true },
      canEdit: false,
    });
  });
});

describe('nextMonthTargets', () => {
  const NOVEMBER = { year: 2026, month: 11 };
  const DECEMBER = { year: 2026, month: 12 };

  const record = (year: number, month: number, revenueTargetCents: number, netProfitTargetCents: number, jobsTarget: number) => ({
    year, month, revenueTargetCents, netProfitTargetCents, jobsTarget, notes: null,
  });
  type Saved = ReturnType<typeof record>[];
  const loaded = (data: Saved): Block<Saved> => ({ status: 'loaded', data, refreshing: false });
  const onCurrentMonth = { canSetTargets: true, isCurrentMonth: true, current: NOVEMBER };

  it('offers the form for next month on the current month, to a viewer who may set targets', () => {
    expect(nextMonthTargets({ ...onCurrentMonth, saved: loaded([]) })).toEqual({
      kind: 'ready',
      month: DECEMBER,
      values: null,
    });
  });

  it('is not offered on a past month', () => {
    expect(nextMonthTargets({ ...onCurrentMonth, isCurrentMonth: false, saved: loaded([]) })).toEqual({ kind: 'hidden' });
  });

  it('is not offered to a viewer who may not set targets, whatever the month', () => {
    expect(nextMonthTargets({ ...onCurrentMonth, canSetTargets: false, saved: loaded([]) })).toEqual({ kind: 'hidden' });
    expect(
      nextMonthTargets({ canSetTargets: false, isCurrentMonth: false, current: NOVEMBER, saved: loaded([]) }),
    ).toEqual({ kind: 'hidden' });
  });

  it('opens with next month’s saved targets when they exist', () => {
    const saved = loaded([record(2026, 11, 40_000_000, 12_000_000, 12), record(2026, 12, 45_000_000, 0, 14)]);
    expect(nextMonthTargets({ ...onCurrentMonth, saved })).toEqual({
      kind: 'ready',
      month: DECEMBER,
      values: targets(45_000_000, 0, 14),
    });
  });

  it('opens empty when only other months have targets', () => {
    const saved = loaded([record(2026, 11, 40_000_000, 12_000_000, 12), record(2025, 12, 30_000_000, 0, 9)]);
    expect(nextMonthTargets({ ...onCurrentMonth, saved })).toMatchObject({ kind: 'ready', values: null });
  });

  it('takes January of the next year as the month after December', () => {
    const saved = loaded([record(2027, 1, 50_000_000, 15_000_000, 16)]);
    expect(nextMonthTargets({ ...onCurrentMonth, current: DECEMBER, saved })).toEqual({
      kind: 'ready',
      month: { year: 2027, month: 1 },
      values: targets(50_000_000, 15_000_000, 16),
    });
  });

  it('offers no form while the saved targets load, or after they could not be read', () => {
    // A form opened blank here would save over figures that may exist.
    expect(nextMonthTargets({ ...onCurrentMonth, saved: { status: 'loading' } })).toEqual({ kind: 'loading' });
    expect(nextMonthTargets({ ...onCurrentMonth, saved: { status: 'failed', httpStatus: 500 } })).toEqual({ kind: 'failed' });
  });

  it('keeps offering the form while the saved targets are asked for again', () => {
    const saved: Block<Saved> = { status: 'loaded', data: [record(2026, 12, 45_000_000, 0, 14)], refreshing: true };
    expect(nextMonthTargets({ ...onCurrentMonth, saved })).toMatchObject({ kind: 'ready', values: targets(45_000_000, 0, 14) });
  });
});

describe('parseTargetsForm', () => {
  it('turns shillings into cents and keeps the jobs count', () => {
    expect(parseTargetsForm({ revenue: '400000', netProfit: '120000.50', jobs: '12' })).toEqual({
      ok: true,
      targets: targets(40_000_000, 12_000_050, 12),
    });
  });

  it('reads a blank or zero field as "no target"', () => {
    expect(parseTargetsForm({ revenue: '400000', netProfit: '', jobs: '12' })).toEqual({
      ok: true,
      targets: targets(40_000_000, 0, 12),
    });
    expect(parseTargetsForm({ revenue: ' ', netProfit: '0', jobs: '' })).toEqual({
      ok: true,
      targets: targets(0, 0, 0),
    });
  });

  it('accepts thousands separators as typed', () => {
    expect(parseTargetsForm({ revenue: '400,000', netProfit: '', jobs: '' })).toEqual({
      ok: true,
      targets: targets(40_000_000, 0, 0),
    });
  });

  it('rejects a jobs number that is not whole, and says why', () => {
    const result = parseTargetsForm({ revenue: '400000', netProfit: '', jobs: '12.5' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.jobs).toMatch(/whole number/i);
    expect(result.errors.revenue).toBeUndefined();
    expect(result.errors.netProfit).toBeUndefined();
  });

  it('rejects an amount that is negative or not a number, and says which field', () => {
    const negative = parseTargetsForm({ revenue: '-5', netProfit: '', jobs: '' });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.errors.revenue).toBeTruthy();

    const words = parseTargetsForm({ revenue: '', netProfit: 'lots', jobs: '' });
    expect(words.ok).toBe(false);
    if (!words.ok) expect(words.errors.netProfit).toBeTruthy();

    const negativeJobs = parseTargetsForm({ revenue: '', netProfit: '', jobs: '-3' });
    expect(negativeJobs.ok).toBe(false);
    if (!negativeJobs.ok) expect(negativeJobs.errors.jobs).toBeTruthy();
  });
});

describe('targetsFormFields', () => {
  it('opens blank when the month has no targets', () => {
    expect(targetsFormFields(null)).toEqual({ revenue: '', netProfit: '', jobs: '' });
  });

  it('opens with the saved values, and leaves an unset target blank', () => {
    expect(targetsFormFields(targets(40_000_000, 0, 12))).toEqual({ revenue: '400,000', netProfit: '', jobs: '12' });
  });

  it('groups thousands and keeps the cents of an amount that has them', () => {
    expect(targetsFormFields(targets(123_456_700, 12_000_050, 1_200))).toEqual({
      revenue: '1,234,567',
      netProfit: '120,000.5',
      jobs: '1,200',
    });
  });

  it('gives back what the form saved', () => {
    const saved = targets(40_000_000, 12_000_050, 12);
    expect(parseTargetsForm(targetsFormFields(saved))).toEqual({ ok: true, targets: saved });
  });
});
