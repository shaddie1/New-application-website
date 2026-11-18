/**
 * What the owner sends to the machine register, as each route of
 * routes/machines.ts checks it. A rule's message is a sentence the page shows
 * as it is.
 */
import { z } from 'zod';
import type {
  AddMachineInput,
  AddMachineRepairInput,
  EditMachineDaysInput,
  EditMachineInput,
  EditMachineHireInput,
  GiveMachineRateInput,
  LogMachineDaysInput,
  LogMachineHireInput,
  MarkHirePaidInput,
  PayMachineInvestorInput,
  ReplaceMachineInvestorsInput,
} from '@onyxhawk/types';

import { nairobiToday } from '../finance/comparison.js';

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'] as const;

const DayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date must be YYYY-MM-DD.');

/** A daily rate, named in its own message: "The hire rate must be ...". Whole shillings keep half a day a whole number of cents. */
const RateCents = (rate: 'project rate' | 'hire rate' | 'daily rate') => {
  const rule = `The ${rate} must be whole shillings, above zero.`;
  return z.number({ required_error: rule, invalid_type_error: rule }).int(rule).positive(rule).multipleOf(100, rule);
};
const ProjectRateCents = RateCents('project rate');
const HireRateCents = RateCents('hire rate');
// The rate of one line of days or one hire, when the owner gives it a different one (R6, R8).
const LineRateCents = RateCents('daily rate');

const RELOAD = 'This page is out of date. Reload it and try again.';

/**
 * KTD6: a back-office page opened before the two rates came in still sends the
 * one daily rate, and nothing in it says which rate the owner meant. zod drops
 * a key it does not know, so the key is named here and refused whenever it is
 * sent. It is the first key of each schema below, so its message is the one the
 * page shows, ahead of the missing rates an older page also leaves out.
 */
const OldDailyRate = z.undefined({ invalid_type_error: RELOAD });

/**
 * KTD6: an older hire form sends the amount charged it had the owner type. A
 * hire is now charged days x the rate, and that typed amount says nothing about
 * which rate was meant, so it is refused the same way.
 */
const OldChargedAmount = z.undefined({ invalid_type_error: RELOAD });

const PRICE_RULE = 'The price must be a whole number of cents, zero or more.';
const PriceCents = z.number({ required_error: PRICE_RULE, invalid_type_error: PRICE_RULE }).int(PRICE_RULE).nonnegative(PRICE_RULE);

const MachineName = z.string({ required_error: 'Give the machine a name.' }).trim().min(1, 'Give the machine a name.').max(200);

// The purchase date is today when left out, so what comes in is wider than
// AddMachineInput: only what comes out is held to it.
export const AddMachineSchema = z.object({
  dailyRateCents: OldDailyRate,
  name: MachineName,
  purchaseDate: DayStr.default(nairobiToday),
  priceCents: PriceCents,
  projectRateCents: ProjectRateCents,
  hireRateCents: HireRateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<AddMachineInput, z.ZodTypeDef, unknown>;

export const GiveMachineRateSchema = z.object({
  dailyRateCents: OldDailyRate,
  projectRateCents: ProjectRateCents,
  hireRateCents: HireRateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<GiveMachineRateInput>;

// Each rate is optional, never nullable: it can be changed and not cleared (R5).
export const EditMachineSchema = z.object({
  dailyRateCents: OldDailyRate,
  name: MachineName.optional(),
  priceCents: PriceCents.optional(),
  projectRateCents: ProjectRateCents.optional(),
  hireRateCents: HireRateCents.optional(),
  // R3: only `true` means anything. Leaving it out leaves the mark as it is.
  ratesReviewed: z.literal(true).optional(),
  condition: z.enum(CONDITIONS).optional(),
  startDay: DayStr.optional(),
}) satisfies z.ZodType<EditMachineInput>;

const INVESTOR_NAME_RULE = 'Each investor needs a name.';
const INVESTOR_AMOUNT_RULE = 'Each investor\'s amount must be a whole number of cents, above zero.';
export const ReplaceInvestorsSchema = z.object({
  investors: z.array(
    z.object({
      name: z.string({ required_error: INVESTOR_NAME_RULE }).trim().min(1, INVESTOR_NAME_RULE).max(200),
      contributionCents: z
        .number({ required_error: INVESTOR_AMOUNT_RULE, invalid_type_error: INVESTOR_AMOUNT_RULE })
        .int(INVESTOR_AMOUNT_RULE)
        .positive(INVESTOR_AMOUNT_RULE),
    }),
  ),
}) satisfies z.ZodType<ReplaceMachineInvestorsInput>;

export const AddRepairSchema = z.object({
  date: DayStr,
  description: z.string().trim().min(1, 'Say what was repaired.').max(500),
  costCents: z.number().int().nonnegative(),
  performedBy: z.string().trim().max(200).optional(),
  receiptRef: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<AddMachineRepairInput>;

const DAYS_RULE = 'Days are counted in halves and must be more than zero.';
// KTD5: a whole number of half days. 5 is two and a half days.
const HalfDays = z.number({ required_error: DAYS_RULE, invalid_type_error: DAYS_RULE }).int(DAYS_RULE).positive(DAYS_RULE);

const JOB_RULE = 'Choose the job the machine worked on.';
export const LogDaysSchema = z.object({
  jobId: z.string({ required_error: JOB_RULE }).min(1, JOB_RULE),
  halfDays: HalfDays,
  rateCents: LineRateCents.optional(),
}) satisfies z.ZodType<LogMachineDaysInput>;

const NOTHING_TO_CHANGE = 'Change the days or the daily rate.';
// KTD9: either can change; a rate left out keeps the line's own.
export const EditDaysSchema = z
  .object({ halfDays: HalfDays.optional(), rateCents: LineRateCents.optional() })
  .refine((d) => d.halfDays !== undefined || d.rateCents !== undefined, NOTHING_TO_CHANGE) satisfies z.ZodType<EditMachineDaysInput>;

const CUSTOMER_RULE = 'Say who hired the machine.';

// What logging a hire and correcting one both send: the client and the start
// date. The phone and notes are kept in the hire job's own fields (KTD5).
const hireClient = {
  chargedCents: OldChargedAmount,
  customerName: z.string({ required_error: CUSTOMER_RULE }).trim().min(1, CUSTOMER_RULE).max(200),
  customerPhone: z.string().trim().max(30, 'A phone number can be at most 30 characters.').optional(),
  notes: z.string().trim().max(1000, 'Notes can be at most 1,000 characters.').optional(),
  startDate: DayStr,
};

// R8 and KTD4: the client is charged days x the rate, so no amount is sent.
export const LogHireSchema = z.object({
  ...hireClient,
  halfDays: HalfDays,
  rateCents: LineRateCents.optional(),
}) satisfies z.ZodType<LogMachineHireInput>;

// KTD10: with neither days nor a rate, a correction changes no figure.
export const EditHireSchema = z.object({
  ...hireClient,
  halfDays: HalfDays.optional(),
  rateCents: LineRateCents.optional(),
}) satisfies z.ZodType<EditMachineHireInput>;

// R14: the paid mark. Only its own two columns change (R15).
export const MarkHirePaidSchema = z.object({
  paidOn: DayStr,
  reference: z.string().trim().max(200, 'A reference can be at most 200 characters.').optional(),
}) satisfies z.ZodType<MarkHirePaidInput>;

const INVESTOR_RULE = 'Choose the investor who was paid.';
const PAYMENT_RULE = 'The payment must be a whole number of cents, above zero.';
export const PayInvestorSchema = z.object({
  investorId: z.string({ required_error: INVESTOR_RULE }).min(1, INVESTOR_RULE),
  date: DayStr,
  amountCents: z.number({ required_error: PAYMENT_RULE, invalid_type_error: PAYMENT_RULE }).int(PAYMENT_RULE).positive(PAYMENT_RULE),
  reference: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<PayMachineInvestorInput>;

/** The first thing wrong with what was sent, as a sentence the page can show. */
export const firstProblem = (error: z.ZodError) => error.issues[0]!.message;
