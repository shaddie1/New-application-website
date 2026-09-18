import { describe, expect, it } from 'vitest';
import type { CompanyReadinessFlags } from '@onyxhawk/types';

import { canEditItem, isBlocker, isOverdue, priorityApplies, summarise } from './rules.js';
import { COMPLIANCE_SEED } from './seed.js';

const none: CompanyReadinessFlags = { agpoEligible: false, laundryGoDecision: 'PENDING', hiringStarted: false };
const all: CompanyReadinessFlags = { agpoEligible: true, laundryGoDecision: 'GO', hiringStarted: true };

describe('seed', () => {
  it('has all 56 items, numbered 1–56, in the sheet categories', () => {
    expect(COMPLIANCE_SEED.map((s) => s.itemNo)).toEqual(Array.from({ length: 56 }, (_, i) => i + 1));
    expect(new Set(COMPLIANCE_SEED.map((s) => s.category))).toEqual(
      new Set(['Legal', 'Finance', 'Tenders', 'Insurance', 'Compliance', 'People', 'Brand', 'Tools', 'Operations', 'Growth', 'Laundry']),
    );
  });
  it('carries the sheet costs and conditional priorities', () => {
    const by = (n: number) => COMPLIANCE_SEED.find((s) => s.itemNo === n)!;
    expect(by(4)).toMatchObject({ costKes: 4200, costType: 'Annual' });
    expect(by(23)).toMatchObject({ costKes: 2100, costType: 'Per person' });
    expect(by(13).priority).toBe('MUST_HAVE_IF_ELIGIBLE');
    expect(by(28).priority).toBe('MUST_HAVE_BEFORE_HIRING');
    expect(by(51).priority).toBe('MUST_HAVE_IF_GO');
    expect(by(1).costType).toBe('eCitizen invoice');
    expect(by(30).itemAction).toBe('One official phone number everywhere (profile shows +254 115 247 988; website shows +254 702 416 697)');
  });
});

describe('priorityApplies', () => {
  it('gates the conditional must-haves on the readiness flags', () => {
    expect(priorityApplies('MUST_HAVE', none)).toBe(true);
    expect(priorityApplies('MUST_HAVE_IF_ELIGIBLE', none)).toBe(false);
    expect(priorityApplies('MUST_HAVE_IF_ELIGIBLE', { ...none, agpoEligible: true })).toBe(true);
    expect(priorityApplies('MUST_HAVE_IF_GO', { ...none, laundryGoDecision: 'NO_GO' })).toBe(false);
    expect(priorityApplies('MUST_HAVE_IF_GO', { ...none, laundryGoDecision: 'GO' })).toBe(true);
    expect(priorityApplies('MUST_HAVE_BEFORE_HIRING', { ...none, hiringStarted: true })).toBe(true);
    expect(priorityApplies('RECOMMENDED', none)).toBe(true);
  });
});

describe('isBlocker / isOverdue', () => {
  it('flags applicable must-haves that are not done or N/A', () => {
    expect(isBlocker('MUST_HAVE', 'NOT_STARTED', none)).toBe(true);
    expect(isBlocker('MUST_HAVE', 'BLOCKED', none)).toBe(true);
    expect(isBlocker('MUST_HAVE', 'DONE', none)).toBe(false);
    expect(isBlocker('MUST_HAVE', 'NOT_APPLICABLE', none)).toBe(false);
    expect(isBlocker('MUST_HAVE_IF_GO', 'NOT_STARTED', none)).toBe(false);
    expect(isBlocker('MUST_HAVE_IF_GO', 'NOT_STARTED', all)).toBe(true);
    expect(isBlocker('RECOMMENDED', 'NOT_STARTED', none)).toBe(false);
  });
  it('is overdue only while still open', () => {
    expect(isOverdue('2026-10-01', 'NOT_STARTED', '2026-10-02')).toBe(true);
    expect(isOverdue('2026-10-01', 'IN_PROGRESS', '2026-10-02')).toBe(true);
    expect(isOverdue('2026-10-02', 'NOT_STARTED', '2026-10-02')).toBe(false);
    expect(isOverdue('2026-10-01', 'DONE', '2026-10-02')).toBe(false);
    expect(isOverdue('2026-10-01', 'BLOCKED', '2026-10-02')).toBe(false);
    expect(isOverdue('2026-10-01', 'NOT_APPLICABLE', '2026-10-02')).toBe(false);
  });
});

describe('canEditItem', () => {
  it('lets the owner and COO edit anything', () => {
    expect(canEditItem({ role: 'ADMIN', isOwner: true }, 'Comms')).toBe(true);
    expect(canEditItem({ role: 'COO', isOwner: false }, 'CEO')).toBe(true);
  });
  it('matches other roles to the owner cell by keyword', () => {
    const bd = { role: 'BUSINESS_DEVELOPMENT_LEAD', isOwner: false };
    const comms = { role: 'MARKETING', isOwner: false };
    const finance = { role: 'FINANCIAL_MANAGER', isOwner: false };
    expect(canEditItem(bd, 'BD Lead')).toBe(true);
    expect(canEditItem(bd, 'BD Lead (COO approves)')).toBe(true);
    expect(canEditItem(bd, 'COO + BD Lead')).toBe(true);
    expect(canEditItem(bd, 'CEO')).toBe(false);
    expect(canEditItem(comms, 'CEO + Comms')).toBe(true);
    expect(canEditItem(comms, 'COO')).toBe(false);
    expect(canEditItem(finance, 'COO')).toBe(false);
    expect(canEditItem({ role: 'SUPPORT', isOwner: false }, 'COO')).toBe(false);
  });
});

describe('summarise', () => {
  const rows = [
    { itemNo: 1, priority: 'MUST_HAVE' as const, status: 'DONE' as const, targetDate: '2026-10-09', costCents: 0 },
    { itemNo: 4, priority: 'MUST_HAVE' as const, status: 'NOT_STARTED' as const, targetDate: '2026-10-16', costCents: 420_000 },
    { itemNo: 13, priority: 'MUST_HAVE_IF_ELIGIBLE' as const, status: 'NOT_STARTED' as const, targetDate: '2026-10-30', costCents: 0 },
    { itemNo: 19, priority: 'MUST_HAVE' as const, status: 'BLOCKED' as const, targetDate: '2026-11-30', costCents: 0 },
    { itemNo: 22, priority: 'OPTIONAL' as const, status: 'NOT_APPLICABLE' as const, targetDate: '2027-06-30', costCents: 500_000 },
    { itemNo: 23, priority: 'MUST_HAVE' as const, status: 'IN_PROGRESS' as const, targetDate: '2026-11-30', costCents: 210_000 },
    { itemNo: 51, priority: 'MUST_HAVE_IF_GO' as const, status: 'NOT_STARTED' as const, targetDate: '2027-02-12', costCents: 0 },
  ];

  it('counts done over what applies, lists blockers, sums the remaining cost', () => {
    const s = summarise(rows, none, '2026-10-20');
    expect(s.total).toBe(4); // 1, 4, 19, 23 — 13 and 51 do not apply yet, 22 is N/A
    expect(s.done).toBe(1);
    expect(s.percent).toBe(25);
    expect(s.blockers).toEqual([4, 19, 23]);
    expect(s.overdue).toBe(1); // item 4
    expect(s.problems).toBe(2); // overdue 4 + blocked 19
    expect(s.remainingCostCents).toBe(630_000); // 4,200 + 2,100; the N/A item's 5,000 is not counted
  });

  it('brings the conditional items in once their flags are set', () => {
    const s = summarise(rows, all, '2026-10-20');
    expect(s.total).toBe(6);
    expect(s.blockers).toEqual([4, 13, 19, 23, 51]);
    expect(s.percent).toBe(17);
  });
});
