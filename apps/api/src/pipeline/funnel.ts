/**
 * Funnel calculations — pure functions over logged activity and the locked
 * targets, so they are unit-testable and never depend on the database.
 *
 *   actualRate[stage] = leads reaching the stage this month
 *                     ÷ leads reaching the prior stage this month
 *   flag when actualRate < lockedRate × 0.8          (the sheet's rule)
 *
 *   Required activity (on demand, nothing stored):
 *   winsPerChannel        = winsWantedPerYear × channelShare
 *   activityNeededPerYear = winsPerChannel ÷ Π(channel's locked rates)
 *   activityNeededPerMonth = activityNeededPerYear ÷ 12
 *
 *   Commission: (revenue − direct costs) × rate to whoever brought the lead
 *   in, on every win.
 */
import type {
  ActivityActual,
  CalculatorChannel,
  FunnelActualsDto,
  FunnelChannel,
  FunnelTargets,
  LeadStage,
  LockedRate,
  RequiredActivityInput,
  RequiredActivityResult,
  StageActual,
  TenderType,
} from '@onyxhawk/types';

// ── Classifying the sheet's free text ───────────────────────────────────────

/** "Warm introduction", "warm intro from X" → WARM_INTRO, and so on. */
export function classifyChannel(text: string): FunnelChannel {
  const t = text.toLowerCase();
  if (/warm|intro/.test(t)) return 'WARM_INTRO';
  if (/household|enquir|inquir|walk-?in|website|social/.test(t)) return 'HOUSEHOLD_ENQUIRY';
  if (/referr/.test(t)) return 'REFERRAL';
  if (/direct|outreach|cold|call|email|visit/.test(t)) return 'DIRECT_OUTREACH';
  return 'OTHER';
}

/** Marketing's funnel: households, however the segment is worded. */
export function isHouseholdSegment(text: string): boolean {
  return /household|home|residen|domestic|apartment|flat|villa/i.test(text);
}

/** Anything that is not a one-off is a recurring contract. */
export function isRecurringContract(contractType: string | null | undefined): boolean {
  if (!contractType) return false;
  return !/one[\s-]?off|once|single/i.test(contractType);
}

/** Public tenders vs the private RFQ / EOI / NGO route on the rates card. */
export function tenderIsPublic(type: TenderType): boolean {
  return type === 'TENDER';
}

/** Free-text status → did the pack go in, or was it awarded? */
export function statusIsSubmission(status: string): boolean {
  return /submitted/i.test(status);
}
export function statusIsAward(status: string): boolean {
  return /\bawarded\b/i.test(status) && !/not awarded|unsuccessful|lost/i.test(status);
}

/** A stage being reached by a lead (CREATED counts as reaching CONTACTED). */
export interface LeadStageEvent {
  stage: LeadStage;
  channel: FunnelChannel;
  household: boolean;
  recurring: boolean;
}

/** A tender changing status. */
export interface TenderStatusEvent {
  status: string;
  type: TenderType;
}

const BELOW_LOCKED_FACTOR = 0.8;

/** 1 for the first twelve months of the plan (and anything before it), 2 after. */
export function planYear(month: string, year1Start: string): 1 | 2 {
  return monthIndex(month, year1Start) >= 12 ? 2 : 1;
}

/** Months since the plan started; negative before it. */
export function monthIndex(month: string, year1Start: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const [y0, m0] = year1Start.split('-').map(Number) as [number, number];
  return (y - y0) * 12 + (m - m0);
}

export function lockedRateFor(rate: LockedRate, year: 1 | 2): number {
  return year === 2 && rate.year2 !== undefined ? rate.year2 : rate.year1;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── Actuals vs locked ───────────────────────────────────────────────────────

const ORG_CHANNELS: FunnelChannel[] = ['DIRECT_OUTREACH', 'WARM_INTRO', 'REFERRAL', 'OTHER'];

export function computeActuals(
  month: string,
  leadEvents: LeadStageEvent[],
  tenderEvents: TenderStatusEvent[],
  targets: FunnelTargets,
): FunnelActualsDto {
  const year = planYear(month, targets.year1Start);
  const idx = monthIndex(month, targets.year1Start);

  const org = (stage: LeadStage, channels: FunnelChannel[] = ORG_CHANNELS) =>
    leadEvents.filter((e) => e.stage === stage && !e.household && channels.includes(e.channel)).length;
  const household = (stage: LeadStage) => leadEvents.filter((e) => e.stage === stage && e.household).length;
  const tender = (what: 'submitted' | 'awarded', isPublic: boolean) =>
    tenderEvents.filter(
      (e) => tenderIsPublic(e.type) === isPublic && (what === 'submitted' ? statusIsSubmission(e.status) : statusIsAward(e.status)),
    ).length;

  const wonOrg = leadEvents.filter((e) => e.stage === 'WON' && !e.household);

  /** numerator / denominator per rate key; undefined = cannot be measured here. */
  const counts: Record<string, [number, number] | undefined> = {
    direct_contact_to_conversation: [org('CONVERSATION', ['DIRECT_OUTREACH']), org('CONTACTED', ['DIRECT_OUTREACH'])],
    conversation_to_site_visit: [org('SITE_VISIT', ['DIRECT_OUTREACH']), org('CONVERSATION', ['DIRECT_OUTREACH'])],
    site_visit_to_proposal: [org('PROPOSAL_SENT'), org('SITE_VISIT')],
    proposal_to_signed: [org('WON'), org('PROPOSAL_SENT')],
    warm_intro_to_site_visit: [org('SITE_VISIT', ['WARM_INTRO']), org('CONTACTED', ['WARM_INTRO'])],
    warm_intro_to_signed: [org('WON', ['WARM_INTRO']), org('CONTACTED', ['WARM_INTRO'])],
    public_tender_to_award: [tender('awarded', true), tender('submitted', true)],
    private_rfq_to_award: [tender('awarded', false), tender('submitted', false)],
    share_wins_recurring: [wonOrg.filter((e) => e.recurring).length, wonOrg.length],
    household_enquiry_to_paid_first_two_months: idx < 2 ? [household('WON'), household('CONTACTED')] : undefined,
    household_enquiry_to_paid: idx >= 2 ? [household('WON'), household('CONTACTED')] : undefined,
    repeat_household_booking_rate: undefined, // needs booking history, not lead activity
  };

  const stages: StageActual[] = targets.lockedRates.map((rate) => {
    const pair = counts[rate.key];
    const lockedRate = lockedRateFor(rate, year);
    if (!pair) {
      return { key: rate.key, label: rate.label, numerator: 0, denominator: 0, actualRate: null, lockedRate, belowLocked: false, tracked: false };
    }
    const [numerator, denominator] = pair;
    const actualRate = denominator > 0 ? numerator / denominator : null;
    return {
      key: rate.key,
      label: rate.label,
      numerator,
      denominator,
      actualRate: actualRate === null ? null : Math.round(actualRate * 10000) / 10000,
      lockedRate,
      belowLocked: actualRate !== null && actualRate < lockedRate * BELOW_LOCKED_FACTOR,
      tracked: true,
    };
  });

  const activityCounts: Record<string, number | undefined> = {
    contacted: org('CONTACTED', ['DIRECT_OUTREACH']),
    warm_intros: org('CONTACTED', ['WARM_INTRO']),
    conversations: org('CONVERSATION'),
    site_visits: org('SITE_VISIT'),
    proposals: org('PROPOSAL_SENT'),
    public_tenders: tender('submitted', true),
    private_submissions: tender('submitted', false),
    signed_work: wonOrg.length,
    recurring_contracts: wonOrg.filter((e) => e.recurring).length,
    household_enquiries: household('CONTACTED'),
    new_household_customers: household('WON'),
  };

  const activity: ActivityActual[] = targets.series.map((s) => {
    const actual = s.tracked ? activityCounts[s.key] : undefined;
    return {
      key: s.key,
      label: s.label,
      owner: s.owner,
      kind: s.kind,
      target: s.byMonth[month] ?? null,
      actual: actual ?? null,
      tracked: s.tracked && actual !== undefined,
    };
  });

  return { month, monthLabel: monthLabel(month), year, stages, activity };
}

// ── Required-activity calculator ────────────────────────────────────────────

const CHANNEL_LABELS: Record<CalculatorChannel, { label: string; activity: string }> = {
  DIRECT_OUTREACH: { label: 'Direct outreach', activity: 'Organisations contacted' },
  WARM_INTRO: { label: 'Warm introductions', activity: 'Warm intros followed up' },
  PUBLIC_TENDER: { label: 'Public tenders', activity: 'Public tender submissions' },
  PRIVATE_RFQ: { label: 'Private RFQ / EOI / NGO', activity: 'Private submissions' },
  HOUSEHOLD: { label: 'Household enquiries', activity: 'Household enquiries logged' },
};

export function requiredActivity(input: RequiredActivityInput, targets: FunnelTargets): RequiredActivityResult {
  const r = (key: string) => {
    const rate = targets.lockedRates.find((x) => x.key === key);
    if (!rate) throw new Error(`locked rate "${key}" is missing from the targets`);
    return lockedRateFor(rate, input.year);
  };

  /** Each channel's chain of (stage label, rate), in funnel order, ending in the win. */
  const chains: Record<CalculatorChannel, { label: string; rate: number }[]> = {
    DIRECT_OUTREACH: [
      { label: 'Real conversations', rate: r('direct_contact_to_conversation') },
      { label: 'Site visits and meetings', rate: r('conversation_to_site_visit') },
      { label: 'Proposals and quotes sent', rate: r('site_visit_to_proposal') },
      { label: 'Signed', rate: r('proposal_to_signed') },
    ],
    WARM_INTRO: [
      { label: 'Site visits', rate: r('warm_intro_to_site_visit') },
      // The sheet locks intro → signed directly rather than chaining through proposals.
      { label: 'Signed', rate: r('warm_intro_to_signed') / r('warm_intro_to_site_visit') },
    ],
    PUBLIC_TENDER: [{ label: 'Awarded', rate: r('public_tender_to_award') }],
    PRIVATE_RFQ: [{ label: 'Awarded', rate: r('private_rfq_to_award') }],
    // A full year of enquiries runs at the steady-state (from month 3) rate.
    HOUSEHOLD: [{ label: 'Paid jobs', rate: r('household_enquiry_to_paid') }],
  };

  const channels = (Object.keys(CHANNEL_LABELS) as CalculatorChannel[]).map((channel) => {
    const share = input.channelMix[channel] ?? 0;
    const winsPerYear = input.winsWantedPerYear * share;
    const chain = chains[channel];
    const conversion = chain.reduce((acc, step) => acc * step.rate, 1);
    const activityPerYear = conversion > 0 ? winsPerYear / conversion : 0;

    // Walk the funnel forward from the activity so the intermediate volumes show.
    let running = activityPerYear;
    const stages = chain.map((step) => {
      running *= step.rate;
      return { label: step.label, perYear: round1(running) };
    });

    return {
      channel,
      label: CHANNEL_LABELS[channel].label,
      share,
      winsPerYear: round1(winsPerYear),
      conversion: Math.round(conversion * 10000) / 10000,
      activityLabel: CHANNEL_LABELS[channel].activity,
      activityPerYear: round1(activityPerYear),
      activityPerMonth: round1(activityPerYear / 12),
      stages,
    };
  });

  return { winsWantedPerYear: input.winsWantedPerYear, year: input.year, channels };
}

// ── Commission ──────────────────────────────────────────────────────────────

/**
 * Commission goes to whoever brought the lead in (JD rule) on every win:
 * net profit × rate, never negative — a loss earns nothing rather than a
 * negative "due" figure.
 */
export function leadCommission(
  revenueReceivedCents: number,
  actualDirectCostsCents: number,
  commissionPct: number,
): { netProfitCents: number; commissionCents: number } {
  const netProfitCents = revenueReceivedCents - actualDirectCostsCents;
  return { netProfitCents, commissionCents: Math.max(0, Math.round(netProfitCents * commissionPct)) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
