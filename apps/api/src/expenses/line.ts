/**
 * One expense line of a job, as the owner's Jobs & costs page and a
 * supervisor's job report both enter it: the same checks and the same shape
 * out, whichever route it came through.
 *
 * `amountCents` is the figure every total adds up. A quantity and a price for
 * one explain it, and when they are given the amount must be exactly their
 * product, so a line can never say "4 at KSh 250" beside a different total.
 */
import { z } from 'zod';
import type { ExpenseCategory } from '@prisma/client';
import type { CreateExpenseInput, ExpenseDto } from '@onyxhawk/types';

/** Quantities are whole thousandths: 2500 is two and a half. */
const THOUSANDTHS = 1000;
/** A million of anything is the most one line can count. */
export const MAX_QUANTITY_THOUSANDTHS = 1_000_000 * THOUSANDTHS;
/** KSh 20 million: the amount column is a 32-bit whole number of cents. */
export const MAX_AMOUNT_CENTS = 2_000_000_000;

/**
 * Quantity times the price for one, to the nearest cent, half a cent going up.
 * Whole numbers throughout: the whole units and the part of a unit are
 * multiplied apart, so no product is too large to hold exactly.
 */
export function lineAmountCents(quantityThousandths: number, unitPriceCents: number): number {
  const whole = Math.floor(quantityThousandths / THOUSANDTHS);
  const part = quantityThousandths % THOUSANDTHS;
  return whole * unitPriceCents + Math.floor((part * unitPriceCents + THOUSANDTHS / 2) / THOUSANDTHS);
}

const CreateExpenseSchema = z.object({
  category: z.enum(['MATERIALS', 'TRANSPORT', 'EMPLOYEE_PAY', 'LUNCH', 'MISCELLANEOUS']),
  amountCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
  description: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  quantityThousandths: z.number().int().positive().max(MAX_QUANTITY_THOUSANDTHS).optional(),
  unit: z.string().trim().max(30).optional(),
  unitPriceCents: z.number().int().positive().max(MAX_AMOUNT_CENTS).optional(),
  receiptRef: z.string().trim().max(200).optional(),
}) satisfies z.ZodType<CreateExpenseInput>;

/** What is wrong with each field, in a sentence the form can show as it is. */
const FIELD_REFUSALS: Record<keyof CreateExpenseInput, string> = {
  category: 'Choose a category for the expense.',
  amountCents: 'The amount must be more than zero, and at most KSh 20 million.',
  description: 'The item can be at most 500 characters.',
  date: 'Choose the date of the expense.',
  quantityThousandths: 'The quantity must be more than zero, with at most three decimal places.',
  unit: 'The unit can be at most 30 characters.',
  unitPriceCents: 'The price for one must be more than zero.',
  receiptRef: 'The receipt number can be at most 200 characters.',
};

export const QUANTITY_NEEDS_PRICE = 'Give both a quantity and a price for one, or leave both empty.';
export const UNIT_NEEDS_QUANTITY = 'A unit needs a quantity and a price for one.';
export const AMOUNT_TOO_SMALL = 'That quantity and price come to less than one cent.';
export const AMOUNT_TOO_LARGE = 'That quantity and price come to more than KSh 20 million.';
export const AMOUNT_MISMATCH = 'The amount must be the quantity times the price for one.';

/** The columns of a new expense that come from the form. The route adds the job and who entered it. */
export type ExpenseLine = {
  category: ExpenseCategory;
  amountCents: number;
  description: string | undefined;
  date: Date;
  quantityThousandths: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  receiptRef: string | null;
};

/** Reads a request body as an expense line, or says in a sentence why it is refused. */
export function readExpenseLine(body: unknown): { line: ExpenseLine } | { error: string } {
  const parsed = CreateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const known = typeof field === 'string' && field in FIELD_REFUSALS;
    return { error: known ? FIELD_REFUSALS[field as keyof CreateExpenseInput] : 'Check the expense and try again.' };
  }
  const { category, amountCents, description, date, quantityThousandths, unitPriceCents } = parsed.data;
  const unit = parsed.data.unit || null;
  const receiptRef = parsed.data.receiptRef || null;
  const lumpSum = { category, amountCents, description, date: new Date(date), receiptRef };

  if (quantityThousandths === undefined && unitPriceCents === undefined) {
    if (unit) return { error: UNIT_NEEDS_QUANTITY };
    return { line: { ...lumpSum, quantityThousandths: null, unit: null, unitPriceCents: null } };
  }
  if (quantityThousandths === undefined || unitPriceCents === undefined) return { error: QUANTITY_NEEDS_PRICE };

  const worked = lineAmountCents(quantityThousandths, unitPriceCents);
  if (worked < 1) return { error: AMOUNT_TOO_SMALL };
  if (worked > MAX_AMOUNT_CENTS) return { error: AMOUNT_TOO_LARGE };
  if (worked !== amountCents) return { error: AMOUNT_MISMATCH };
  return { line: { ...lumpSum, quantityThousandths, unit, unitPriceCents } };
}

/** An expense as a job list reads it from the database. */
export type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string | null;
  date: Date;
  jobId: string | null;
  bookingId: string | null;
  createdAt: Date;
  quantityThousandths?: number | null;
  unit?: string | null;
  unitPriceCents?: number | null;
  receiptRef?: string | null;
};

/** A quantity, unit and price, each only when the row has it: a lump-sum line carries none of them. */
export function lineDetail(row: Pick<ExpenseRow, 'quantityThousandths' | 'unit' | 'unitPriceCents'>) {
  if (row.quantityThousandths == null || row.unitPriceCents == null) return {};
  return {
    quantityThousandths: row.quantityThousandths,
    ...(row.unit && { unit: row.unit }),
    unitPriceCents: row.unitPriceCents,
  };
}

export function toExpenseDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amountCents,
    description: row.description,
    date: row.date.toISOString().slice(0, 10),
    jobId: row.jobId,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
    ...lineDetail(row),
    ...(row.receiptRef && { receiptRef: row.receiptRef }),
  };
}
