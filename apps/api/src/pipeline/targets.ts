/**
 * The locked funnel targets: conversion rates and the month-by-month
 * activity table, seeded from OnyxHawk_Sales_Targets_and_Trackers.xlsx
 * (Oct 2026 – Sep 2028). One editable record, same pattern as QuoteRates;
 * the sheet's own rule is that the rates change only at a quarterly review,
 * which the API records as sourcePolicy and the UI enforces with a confirm.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { FunnelTargets, FunnelTargetsDto, TargetSeries } from '@onyxhawk/types';

import { prisma } from '../db.js';

export const TARGETS_ID = 'default';
export const YEAR1_START = '2026-10';

// Sep 2027 is seeded on the year-1 plateau (80 contacted, 3 intros, …): the
// workbook's month list shows the step-up there, but its own year-1 totals
// (880, 35, 52.8, 43.9, 35.12) only reconcile with the step-up from Oct 2027.

/** The 24 months of the plan, YYYY-MM, in order. */
export const PLAN_MONTHS: string[] = Array.from({ length: 24 }, (_, i) => {
  const y = 2026 + Math.floor((9 + i) / 12);
  const m = ((9 + i) % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
});

const byMonth = (values: number[]): Record<string, number> => {
  if (values.length !== 24) throw new Error(`expected 24 monthly values, got ${values.length}`);
  return Object.fromEntries(PLAN_MONTHS.map((m, i) => [m, values[i]!]));
};
const rep = (n: number, times: number) => Array<number>(times).fill(n);

const series = (
  key: string, label: string, owner: TargetSeries['owner'], kind: TargetSeries['kind'], tracked: boolean, values: number[],
): TargetSeries => ({ key, label, owner, kind, tracked, byMonth: byMonth(values) });

export const DEFAULT_FUNNEL_TARGETS: FunnelTargets = {
  sourcePolicy: 'locked, quarterly review only',
  year1Start: YEAR1_START,
  monthsBetweenRepeatBookings: 3,

  lockedRates: [
    { key: 'direct_contact_to_conversation', label: 'Direct outreach: contact → conversation', year1: 0.06 },
    { key: 'conversation_to_site_visit', label: 'Conversation → site visit / meeting', year1: 0.5 },
    { key: 'site_visit_to_proposal', label: 'Site visit → proposal / quote sent', year1: 0.8 },
    { key: 'proposal_to_signed', label: 'Proposal → signed', year1: 0.2, year2: 0.25 },
    { key: 'warm_intro_to_site_visit', label: 'Warm intro → site visit', year1: 0.5 },
    { key: 'warm_intro_to_signed', label: 'Warm intro → signed', year1: 0.35 },
    { key: 'public_tender_to_award', label: 'Public tender submission → award', year1: 0.07, year2: 0.1 },
    { key: 'private_rfq_to_award', label: 'Private RFQ / EOI / NGO → award', year1: 0.2, year2: 0.25 },
    { key: 'share_wins_recurring', label: 'Share of wins that are recurring (vs one-off)', year1: 0.7 },
    { key: 'household_enquiry_to_paid_first_two_months', label: 'Household enquiry → paid job, first 2 months', year1: 0.1 },
    { key: 'household_enquiry_to_paid', label: 'Household enquiry → paid job, from month 3', year1: 0.15 },
    { key: 'repeat_household_booking_rate', label: 'Repeat household booking rate', year1: 0.2 },
  ],

  series: [
    // ── Business Development Lead ──────────────────────────────────────────
    series('contacted', 'Organisations contacted directly', 'BD_LEAD', 'TARGET', true,
      [40, 60, 60, ...rep(80, 9), ...rep(100, 12)]),
    series('warm_intros', 'Warm introductions followed up within 2 working days', 'BD_LEAD', 'TARGET', true,
      [2, ...rep(3, 11), ...rep(4, 12)]),
    series('conversations', 'Real conversations', 'BD_LEAD', 'EXPECTED', true,
      [2.4, 3.6, 3.6, ...rep(4.8, 9), ...rep(6, 12)]),
    series('site_visits', 'Site visits and meetings', 'BD_LEAD', 'EXPECTED', true,
      [2.2, 3.3, 3.3, ...rep(3.9, 9), ...rep(5, 12)]),
    series('proposals', 'Proposals and quotes sent', 'BD_LEAD', 'EXPECTED', true,
      [1.76, 2.64, 2.64, ...rep(3.12, 9), ...rep(4, 12)]),
    series('public_tenders', 'Public tender submissions', 'BD_LEAD', 'TARGET', true,
      [1, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 5, 5, 3, 3, 3]),
    series('private_submissions', 'Private RFQ, EOI and NGO submissions', 'BD_LEAD', 'TARGET', true,
      [1, 1, ...rep(2, 22)]),
    series('linkedin_posts', 'LinkedIn posts published after approval', 'BD_LEAD', 'TARGET', false,
      [8, ...rep(12, 23)]),
    series('signed_work', 'Signed work expected — contracts + one-off jobs', 'BD_LEAD', 'EXPECTED', true,
      [0, 0.2, 0.672, 1.178, 1.248, 1.344, 1.344, 1.344, 1.344, 1.344, 1.484, 1.484,
        1.344, 1.444, 1.8, 1.96, 1.96, 1.96, 1.96, 1.96, 1.96, 1.96, 2.16, 2.16]),
    series('recurring_contracts', '  of which recurring contracts', 'BD_LEAD', 'EXPECTED', true,
      [0, 0.14, 0.4704, 0.8246, 0.8736, 0.9408, 0.9408, 0.9408, 0.9408, 0.9408, 1.0388, 1.0388,
        0.9408, 1.0108, 1.26, 1.372, 1.372, 1.372, 1.372, 1.372, 1.372, 1.372, 1.512, 1.512]),
    series('cumulative_signed', 'Cumulative signed work expected', 'BD_LEAD', 'EXPECTED', false,
      [0, 0.2, 0.872, 2.05, 3.298, 4.642, 5.986, 7.33, 8.674, 10.018, 11.502, 12.986,
        14.33, 15.774, 17.574, 19.534, 21.494, 23.454, 25.414, 27.374, 29.334, 31.294, 33.454, 35.614]),

    // ── Communications and Marketing Manager ───────────────────────────────
    series('household_enquiries', 'Household enquiries logged', 'MARKETING', 'TARGET', true,
      [10, 20, 30, 25, 30, 35, 40, 45, 45, 50, 55, 55, 60, 60, 65, 65, 70, 70, 75, 75, 80, 80, 80, 80]),
    series('new_household_customers', 'New household customers', 'MARKETING', 'EXPECTED', true,
      [1, 2, 4.5, 3.75, 4.5, 5.25, 6, 6.75, 6.75, 7.5, 8.25, 8.25, 9, 9, 9.75, 9.75, 10.5, 10.5, 11.25, 11.25, 12, 12, 12, 12]),
    series('repeat_household_jobs', 'Repeat household jobs', 'MARKETING', 'EXPECTED', false,
      [0, 0.067, 0.2, 0.5, 0.75, 1.05, 1.4, 1.8, 2.25, 2.7, 3.2, 3.75, 4.3, 4.833, 5.3, 5.65, 6.05, 6.45, 6.8, 7.15, 7.45, 7.8, 8.1, 8.35]),
  ],
};

// ── Validation ──────────────────────────────────────────────────────────────

const rate = z.number().min(0).max(1);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');

export const FunnelTargetsSchema = z.object({
  sourcePolicy: z.string().trim().min(1).max(120),
  year1Start: month,
  monthsBetweenRepeatBookings: z.number().int().min(1).max(24),
  lockedRates: z
    .array(z.object({ key: z.string().trim().min(1).max(60), label: z.string().trim().min(1).max(120), year1: rate, year2: rate.optional() }))
    .min(1)
    .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, 'rate keys must be unique'),
  series: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
        owner: z.enum(['BD_LEAD', 'MARKETING']),
        kind: z.enum(['TARGET', 'EXPECTED']),
        tracked: z.boolean(),
        byMonth: z.record(month, z.number().min(0)),
      }),
    )
    .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, 'series keys must be unique'),
}) satisfies z.ZodType<FunnelTargets>;

// ── Persistence ─────────────────────────────────────────────────────────────

export async function loadFunnelTargets(): Promise<FunnelTargetsDto> {
  const row = await prisma.funnelTargets.findUnique({
    where: { id: TARGETS_ID },
    include: { updatedBy: { select: { fullName: true } } },
  });
  if (!row) return { targets: DEFAULT_FUNNEL_TARGETS, updatedAt: null, updatedByName: null };
  const parsed = FunnelTargetsSchema.safeParse(row.data);
  if (!parsed.success) return { targets: DEFAULT_FUNNEL_TARGETS, updatedAt: null, updatedByName: null };
  return { targets: parsed.data, updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedBy?.fullName ?? null };
}

export async function saveFunnelTargets(targets: FunnelTargets, userId: string): Promise<FunnelTargetsDto> {
  const data = targets as unknown as Prisma.InputJsonValue;
  const row = await prisma.funnelTargets.upsert({
    where: { id: TARGETS_ID },
    create: { id: TARGETS_ID, data, updatedById: userId },
    update: { data, updatedById: userId },
    include: { updatedBy: { select: { fullName: true } } },
  });
  return { targets, updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedBy?.fullName ?? null };
}
