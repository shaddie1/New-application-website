import { describe, expect, it } from 'vitest';

import { kpiScore, probationOutcome, weightedScore } from './score.js';
import { PROBATION_SEED } from './seed-data.js';
import { monthKey, roleFor } from './seed.js';

describe('seed data', () => {
  it('carries both workplans, the 23-event calendar and 20 KPIs', () => {
    expect(PROBATION_SEED.workplans.map((w) => w.tasks.length)).toEqual([42, 46]);
    expect(PROBATION_SEED.reportingCalendar).toHaveLength(23);
    expect(PROBATION_SEED.kpiScorecard).toHaveLength(20);
    expect(PROBATION_SEED.probationDates).toEqual({ start: '2026-10-05', end: '2026-12-31', decisionLetterBy: '2027-01-08' });
  });
  it('weights sum to 100 per role', () => {
    const byRole = { COMMS: 0, BD: 0 };
    for (const k of PROBATION_SEED.kpiScorecard) byRole[roleFor(k.role)] += k.weight;
    expect(byRole).toEqual({ COMMS: 100, BD: 100 });
  });
  it('maps sheet role names and month labels', () => {
    expect(roleFor('Communications and Marketing Manager')).toBe('COMMS');
    expect(roleFor('Comms Manager')).toBe('COMMS');
    expect(roleFor('Business Development Lead and Site Supervisor')).toBe('BD');
    expect(roleFor('BD Lead')).toBe('BD');
    expect(monthKey('Oct2026')).toBe('2026-10');
    expect(monthKey('Jan2027')).toBe('2027-01');
  });
  it('keeps activity text verbatim', () => {
    const bd = PROBATION_SEED.workplans[1]!.tasks.find((t) => t.no === 'B.1')!;
    expect(bd.activity).toBe('Day 1: company, services, pricing rules (30% minimum, 40% target, 10% contingency), Quotation Calculator, commission rules');
    expect(bd.outputRequired).toBe('2 practice quotes checked by COO');
  });
});

describe('kpiScore', () => {
  it('caps at the weight when actuals meet the summed targets', () => {
    expect(kpiScore({ weight: 10, targets: { '2026-10': 4, '2026-11': 4, '2026-12': 5 }, actuals: { '2026-10': 4, '2026-11': 5, '2026-12': 5 } })).toEqual({ sumTargets: 13, sumActuals: 14, score: 10 });
  });
  it('scales by Σactuals ÷ Σtargets below target', () => {
    expect(kpiScore({ weight: 20, targets: { '2026-10': 1, '2026-11': 2, '2026-12': 5 }, actuals: { '2026-10': 1, '2026-11': 1 } })).toEqual({ sumTargets: 8, sumActuals: 2, score: 5 });
  });
  it('treats a zero-target KPI as all-or-nothing on any actual', () => {
    expect(kpiScore({ weight: 15, targets: { '2026-10': 0, '2026-11': 0 }, actuals: {} }).score).toBe(0);
    expect(kpiScore({ weight: 15, targets: { '2026-10': 0, '2026-11': 0 }, actuals: { '2026-11': 1 } }).score).toBe(15);
  });
  it('works on percentage KPIs the same way', () => {
    expect(kpiScore({ weight: 5, targets: { '2026-10': 0.9, '2026-11': 0.9, '2026-12': 0.9 }, actuals: { '2026-10': 0.9, '2026-11': 0.8, '2026-12': 1 } }).score).toBe(5);
  });
});

describe('weightedScore / probationOutcome', () => {
  const kpis = [
    { weight: 60, targets: { '2026-10': 10 }, actuals: { '2026-10': 10 } }, // 60
    { weight: 40, targets: { '2026-10': 10 }, actuals: { '2026-10': 2 } }, // 8
  ];
  it('divides the summed scores by the summed weights', () => {
    expect(weightedScore(kpis)).toBe(0.68);
    expect(weightedScore([])).toBe(0);
  });
  it('applies the 70 / 55 thresholds and the breach override', () => {
    expect(probationOutcome(0.7, false)).toBe('CONFIRM');
    expect(probationOutcome(0.69, false)).toBe('EXTEND_ONE_MONTH');
    expect(probationOutcome(0.55, false)).toBe('EXTEND_ONE_MONTH');
    expect(probationOutcome(0.54, false)).toBe('NOT_CONFIRMED');
    expect(probationOutcome(0.95, true)).toBe('NOT_CONFIRMED');
  });
  it('extends cleanly when a month is added', () => {
    const extended = kpis.map((k) => ({ ...k, targets: { ...k.targets, '2027-01': 10 }, actuals: { ...k.actuals, '2027-01': 10 } }));
    expect(weightedScore(extended)).toBe(0.84); // 60 + 40 × 12/20
  });
});
