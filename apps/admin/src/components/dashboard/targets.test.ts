import { describe, expect, it } from 'vitest';

import {
  maySetTargets,
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

describe('maySetTargets', () => {
  it('lets the owner, an admin and the financial manager set targets', () => {
    expect(maySetTargets({ isOwner: true, role: 'ADMIN' })).toBe(true);
    expect(maySetTargets({ isOwner: false, role: 'ADMIN' })).toBe(true);
    expect(maySetTargets({ isOwner: false, role: 'FINANCIAL_MANAGER' })).toBe(true);
  });

  it('does not let a shareholder-role account or other staff set targets', () => {
    expect(maySetTargets({ isOwner: false, role: 'SHAREHOLDER' })).toBe(false);
    expect(maySetTargets({ isOwner: false, role: 'SUPPORT' })).toBe(false);
    expect(maySetTargets({ role: 'SHAREHOLDER' })).toBe(false);
  });
});

describe('targetsView', () => {
  it('prompts for targets in the current month when there are none and the viewer may set them', () => {
    expect(targetsView({ values: null, isCurrentMonth: true, maySet: true })).toEqual({ kind: 'prompt' });
    expect(targetsView({ values: targets(0, 0, 0), isCurrentMonth: true, maySet: true })).toEqual({ kind: 'prompt' });
  });

  it('is read-only for a past month with no targets, whoever is looking', () => {
    expect(targetsView({ values: null, isCurrentMonth: false, maySet: true })).toEqual({ kind: 'read-only' });
    expect(targetsView({ values: targets(0, 0, 0), isCurrentMonth: false, maySet: true })).toEqual({ kind: 'read-only' });
    expect(targetsView({ values: null, isCurrentMonth: false, maySet: false })).toEqual({ kind: 'read-only' });
  });

  it('never prompts a viewer who may not set targets', () => {
    expect(targetsView({ values: null, isCurrentMonth: true, maySet: false })).toEqual({ kind: 'read-only' });
  });

  it('shows rings for the targets that are set, and marks the one that is not', () => {
    expect(targetsView({ values: targets(40_000_000, 0, 12), isCurrentMonth: true, maySet: true })).toEqual({
      kind: 'rings',
      set: { revenue: true, netProfit: false, jobs: true },
      canEdit: true,
    });
  });

  it('shows the rings without the edit link to a viewer who may not set targets', () => {
    expect(targetsView({ values: targets(40_000_000, 12_000_000, 12), isCurrentMonth: true, maySet: false })).toEqual({
      kind: 'rings',
      set: { revenue: true, netProfit: true, jobs: true },
      canEdit: false,
    });
  });

  it('keeps the edit link on a past month that has targets', () => {
    const view = targetsView({ values: targets(40_000_000, 0, 12), isCurrentMonth: false, maySet: true });
    expect(view).toMatchObject({ kind: 'rings', canEdit: true });
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
