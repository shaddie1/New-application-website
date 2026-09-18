import { describe, expect, it } from 'vitest';

import { computeActuals, leadCommission, monthIndex, planYear, requiredActivity, type LeadStageEvent, type TenderStatusEvent } from './funnel.js';
import { DEFAULT_FUNNEL_TARGETS, PLAN_MONTHS } from './targets.js';

const T = DEFAULT_FUNNEL_TARGETS;

const lead = (stage: LeadStageEvent['stage'], channel: LeadStageEvent['channel'] = 'DIRECT_OUTREACH', segment: LeadStageEvent['segment'] = 'COMMERCIAL', isRecurring = false): LeadStageEvent =>
  ({ stage, channel, segment, isRecurring });
const tender = (status: TenderStatusEvent['status'], kind: TenderStatusEvent['kind'] = 'PUBLIC_TENDER'): TenderStatusEvent => ({ status, kind });
const many = <T,>(n: number, make: () => T): T[] => Array.from({ length: n }, make);

describe('plan calendar', () => {
  it('lays out 24 months from Oct 2026', () => {
    expect(PLAN_MONTHS[0]).toBe('2026-10');
    expect(PLAN_MONTHS[11]).toBe('2027-09');
    expect(PLAN_MONTHS[23]).toBe('2028-09');
  });
  it('splits year 1 and year 2 at the twelfth month', () => {
    expect(planYear('2026-10', T.year1Start)).toBe(1);
    expect(planYear('2027-09', T.year1Start)).toBe(1);
    expect(planYear('2027-10', T.year1Start)).toBe(2);
    expect(planYear('2026-06', T.year1Start)).toBe(1); // before the plan still reads as year 1
    expect(monthIndex('2026-12', T.year1Start)).toBe(2);
  });
});

describe('seeded targets', () => {
  const total = (key: string, from: number, to: number) =>
    Math.round(PLAN_MONTHS.slice(from, to).reduce((a, m) => a + (T.series.find((s) => s.key === key)!.byMonth[m] ?? 0), 0) * 1000) / 1000;

  it('match the workbook year totals', () => {
    expect(total('contacted', 0, 12)).toBe(880);
    expect(total('contacted', 12, 24)).toBe(1200);
    expect(total('warm_intros', 0, 12)).toBe(35);
    expect(total('warm_intros', 12, 24)).toBe(48);
    expect(total('conversations', 0, 12)).toBe(52.8);
    expect(total('site_visits', 0, 12)).toBe(43.9);
    expect(total('proposals', 0, 12)).toBe(35.12);
    expect(total('public_tenders', 0, 12)).toBe(27);
    expect(total('public_tenders', 12, 24)).toBe(40);
    expect(total('private_submissions', 0, 12)).toBe(22);
    expect(total('private_submissions', 12, 24)).toBe(24);
    expect(total('linkedin_posts', 0, 12)).toBe(140);
    expect(total('signed_work', 0, 12)).toBe(12.986);
    expect(total('signed_work', 12, 24)).toBe(22.628);
    expect(total('recurring_contracts', 0, 12)).toBe(9.09);
    expect(total('household_enquiries', 0, 12)).toBe(440);
    expect(total('household_enquiries', 12, 24)).toBe(860);
    expect(total('new_household_customers', 0, 12)).toBe(64.5);
    expect(total('new_household_customers', 12, 24)).toBe(129);
    expect(total('repeat_household_jobs', 12, 24)).toBe(78.233);
  });
});

describe('computeActuals', () => {
  it('measures each stage against the prior stage in the month, by channel', () => {
    const events = [
      ...many(50, () => lead('NEW')), // 50 organisations contacted
      ...many(3, () => lead('CONVERSATION')), // 6% — on locked
      ...many(1, () => lead('SITE_VISIT')), // 33% vs 50% locked → below 40
      ...many(1, () => lead('PROPOSAL_SENT')), // 100% vs 80%
      ...many(4, () => lead('NEW', 'WARM_INTRO')),
      ...many(2, () => lead('SITE_VISIT', 'WARM_INTRO')), // 50%
      ...many(1, () => lead('WON', 'WARM_INTRO', 'COMMERCIAL', true)), // 25% vs 35% → 0.714 < 0.8 → below
      ...many(20, () => lead('NEW', 'HOUSEHOLD_ENQUIRY', 'HOUSEHOLD')),
      ...many(3, () => lead('WON', 'HOUSEHOLD_ENQUIRY', 'HOUSEHOLD')), // 15%
    ];
    const out = computeActuals('2027-01', events, [tender('SUBMITTED'), tender('SUBMITTED'), tender('AWARDED')], T);
    const by = Object.fromEntries(out.stages.map((s) => [s.key, s]));

    expect(out.year).toBe(1);
    expect(by.direct_contact_to_conversation!).toMatchObject({ numerator: 3, denominator: 50, actualRate: 0.06, lockedRate: 0.06, belowLocked: false });
    expect(by.conversation_to_site_visit!).toMatchObject({ numerator: 1, denominator: 3, actualRate: 0.3333, belowLocked: true });
    expect(by.site_visit_to_proposal!).toMatchObject({ numerator: 1, denominator: 3, actualRate: 0.3333, belowLocked: true }); // 1 of 3 visits (direct + warm)
    expect(by.warm_intro_to_site_visit!).toMatchObject({ numerator: 2, denominator: 4, actualRate: 0.5, belowLocked: false });
    expect(by.warm_intro_to_signed!).toMatchObject({ numerator: 1, denominator: 4, actualRate: 0.25, belowLocked: true });
    expect(by.public_tender_to_award!).toMatchObject({ numerator: 1, denominator: 2, actualRate: 0.5, lockedRate: 0.07, belowLocked: false });
    expect(by.share_wins_recurring!).toMatchObject({ numerator: 1, denominator: 1, actualRate: 1 });
    expect(by.household_enquiry_to_paid!).toMatchObject({ numerator: 3, denominator: 20, actualRate: 0.15, belowLocked: false, tracked: true });
    expect(by.household_enquiry_to_paid_first_two_months!.tracked).toBe(false); // month 4 of the plan
    expect(by.repeat_household_booking_rate!.tracked).toBe(false);
  });

  it('uses the first-two-months household rate in Oct and Nov 2026', () => {
    const out = computeActuals('2026-11', [lead('NEW', 'HOUSEHOLD_ENQUIRY', 'HOUSEHOLD'), lead('WON', 'HOUSEHOLD_ENQUIRY', 'HOUSEHOLD')], [], T);
    const by = Object.fromEntries(out.stages.map((s) => [s.key, s]));
    expect(by.household_enquiry_to_paid_first_two_months!).toMatchObject({ tracked: true, lockedRate: 0.1, actualRate: 1 });
    expect(by.household_enquiry_to_paid!.tracked).toBe(false);
  });

  it('switches to year-2 locked rates from Oct 2027 and leaves empty months unflagged', () => {
    const out = computeActuals('2027-10', [], [], T);
    const by = Object.fromEntries(out.stages.map((s) => [s.key, s]));
    expect(out.year).toBe(2);
    expect(by.proposal_to_signed!.lockedRate).toBe(0.25);
    expect(by.public_tender_to_award!.lockedRate).toBe(0.1);
    expect(by.proposal_to_signed!).toMatchObject({ actualRate: null, belowLocked: false, denominator: 0 });
  });

  it('reports activity counts beside the monthly targets', () => {
    const events = [...many(45, () => lead('NEW')), ...many(2, () => lead('NEW', 'WARM_INTRO')), lead('WON', 'DIRECT_OUTREACH', 'COMMERCIAL', true), ...many(12, () => lead('NEW', 'HOUSEHOLD_ENQUIRY', 'HOUSEHOLD'))];
    const out = computeActuals('2026-10', events, [tender('SUBMITTED'), tender('SUBMITTED', 'PRIVATE_RFQ')], T);
    const by = Object.fromEntries(out.activity.map((a) => [a.key, a]));
    expect(by.contacted!).toMatchObject({ target: 40, actual: 45, kind: 'TARGET', owner: 'BD_LEAD' });
    expect(by.warm_intros!).toMatchObject({ target: 2, actual: 2 });
    expect(by.public_tenders!).toMatchObject({ target: 1, actual: 1 });
    expect(by.private_submissions!).toMatchObject({ target: 1, actual: 1 });
    expect(by.signed_work!).toMatchObject({ target: 0, actual: 1, kind: 'EXPECTED' });
    expect(by.recurring_contracts!).toMatchObject({ actual: 1 });
    expect(by.household_enquiries!).toMatchObject({ target: 10, actual: 12, owner: 'MARKETING' });
    expect(by.linkedin_posts!).toMatchObject({ target: 8, actual: null, tracked: false });
    expect(by.cumulative_signed!.tracked).toBe(false);
  });
});

describe('requiredActivity', () => {
  it('back-calculates yearly and monthly activity per channel from the locked rates', () => {
    const out = requiredActivity(
      { winsWantedPerYear: 12, year: 1, channelMix: { DIRECT_OUTREACH: 0.5, WARM_INTRO: 0.25, PUBLIC_TENDER: 0.125, PRIVATE_RFQ: 0.125, HOUSEHOLD: 0 } },
      T,
    );
    const by = Object.fromEntries(out.channels.map((c) => [c.channel, c]));

    // 6 direct wins ÷ (0.06 × 0.5 × 0.8 × 0.2 = 0.0048) = 1,250 organisations a year
    expect(by.DIRECT_OUTREACH!).toMatchObject({ winsPerYear: 6, conversion: 0.0048, activityPerYear: 1250, activityPerMonth: 104.2 });
    expect(by.DIRECT_OUTREACH!.stages.map((s) => s.perYear)).toEqual([75, 37.5, 30, 6]);
    // 3 warm wins ÷ 0.35 = 8.6 intros a year
    expect(by.WARM_INTRO!).toMatchObject({ winsPerYear: 3, conversion: 0.35, activityPerYear: 8.6, activityPerMonth: 0.7 });
    expect(by.WARM_INTRO!.stages[0]).toEqual({ label: 'Site visits', perYear: 4.3 });
    // 1.5 tender awards ÷ 0.07 = 21.4 submissions
    expect(by.PUBLIC_TENDER!).toMatchObject({ winsPerYear: 1.5, conversion: 0.07, activityPerYear: 21.4, activityPerMonth: 1.8 });
    expect(by.PRIVATE_RFQ!).toMatchObject({ winsPerYear: 1.5, conversion: 0.2, activityPerYear: 7.5 });
    expect(by.HOUSEHOLD!).toMatchObject({ winsPerYear: 0, activityPerYear: 0 });
  });

  it('uses year-2 rates when asked', () => {
    const out = requiredActivity({ winsWantedPerYear: 10, year: 2, channelMix: { DIRECT_OUTREACH: 1, WARM_INTRO: 0, PUBLIC_TENDER: 0, PRIVATE_RFQ: 0, HOUSEHOLD: 0 } }, T);
    expect(out.channels[0]!.conversion).toBe(0.006); // 0.06 × 0.5 × 0.8 × 0.25
    expect(out.channels[0]!.activityPerYear).toBe(1666.7);
  });
});

describe('leadCommission', () => {
  it('pays 5% of net profit on trainee-sourced wins only', () => {
    expect(leadCommission(450_000, 207_000, true, 0.05)).toEqual({ netProfitCents: 243_000, commissionCents: 12_150 });
    expect(leadCommission(450_000, 207_000, false, 0.05)).toEqual({ netProfitCents: 243_000, commissionCents: 0 });
    expect(leadCommission(100_000, 150_000, true, 0.05)).toEqual({ netProfitCents: -50_000, commissionCents: 0 }); // no commission on a loss
  });
});
