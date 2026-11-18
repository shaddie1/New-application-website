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
  GiveMachineRateInput,
  LogMachineDaysInput,
  LogMachineHireInput,
  PayMachineInvestorInput,
  ReplaceMachineInvestorsInput,
} from '@onyxhawk/types';

import { nairobiToday } from '../finance/comparison.js';

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'] as const;

const DayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date must be YYYY-MM-DD.');

const RATE_RULE = 'The daily rate must be whole shillings, above zero.';
// Whole shillings keep half a day a whole number of cents.
const RateCents = z
  .number({ required_error: RATE_RULE, invalid_type_error: RATE_RULE })
  .int(RATE_RULE)
  .positive(RATE_RULE)
  .multipleOf(100, RATE_RULE);

const PRICE_RULE = 'The price must be a whole number of cents, zero or more.';
const PriceCents = z.number({ required_error: PRICE_RULE, invalid_type_error: PRICE_RULE }).int(PRICE_RULE).nonnegative(PRICE_RULE);

const MachineName = z.string({ required_error: 'Give the machine a name.' }).trim().min(1, 'Give the machine a name.').max(200);

// The purchase date is today when left out, so what comes in is wider than
// AddMachineInput: only what comes out is held to it.
export const AddMachineSchema = z.object({
  name: MachineName,
  purchaseDate: DayStr.default(nairobiToday),
  priceCents: PriceCents,
  dailyRateCents: RateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<AddMachineInput, z.ZodTypeDef, unknown>;

export const GiveMachineRateSchema = z.object({
  dailyRateCents: RateCents,
  startDay: DayStr.optional(),
}) satisfies z.ZodType<GiveMachineRateInput>;

// The rate is optional, never nullable: it can be changed and not cleared (R3).
export const EditMachineSchema = z.object({
  name: MachineName.optional(),
  priceCents: PriceCents.optional(),
  dailyRateCents: RateCents.optional(),
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
}) satisfies z.ZodType<LogMachineDaysInput>;

export const EditDaysSchema = z.object({ halfDays: HalfDays }) satisfies z.ZodType<EditMachineDaysInput>;

const CUSTOMER_RULE = 'Say who hired the machine.';
const CHARGE_RULE = 'The amount charged must be a whole number of cents, zero or more.';
// Logging a hire and correcting one send the same four things. The charge may
// be below days x rate (R26): the machine still gets its full rate.
export const HireSchema = z.object({
  customerName: z.string({ required_error: CUSTOMER_RULE }).trim().min(1, CUSTOMER_RULE).max(200),
  startDate: DayStr,
  halfDays: HalfDays,
  chargedCents: z.number({ required_error: CHARGE_RULE, invalid_type_error: CHARGE_RULE }).int(CHARGE_RULE).nonnegative(CHARGE_RULE),
}) satisfies z.ZodType<LogMachineHireInput>;

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
