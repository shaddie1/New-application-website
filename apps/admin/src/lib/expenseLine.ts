/**
 * An expense line as the two expense forms type it and the expense lists show
 * it. The amount is the figure every total adds up; a quantity and a price for
 * one explain it, and the amount is then their product to the nearest cent.
 * The server works the same sum and refuses an amount that differs.
 */
import type { CreateExpenseInput, ExpenseCategory, ExpenseDto } from '@onyxhawk/types';
import { money } from './money';

/** Quantities are whole thousandths: 2500 is two and a half. */
const THOUSANDTHS = 1000;
/** A million of anything is the most one line can count. */
const MAX_QUANTITY_THOUSANDTHS = 1_000_000 * THOUSANDTHS;
/** KSh 20 million: the most one expense can hold. */
const MAX_AMOUNT_CENTS = 2_000_000_000;

export const EXPENSE_UNITS = ['pieces', 'litres', 'kg', 'packets', 'days', 'hours', 'trips', 'people'];

export const DATE_NEEDED = 'Choose the date of the expense.';
export const AMOUNT_NEEDED = 'Type the amount, or fill in a quantity and a price for one.';
export const AMOUNT_INVALID = 'The amount must be more than zero, and at most KSh 20 million.';
export const QUANTITY_NEEDS_PRICE = 'Fill in both the quantity and the price for one, or leave both empty.';
export const UNIT_NEEDS_QUANTITY = 'A unit needs a quantity and a price for one. Fill them in, or clear the unit.';
export const QUANTITY_INVALID = 'The quantity must be more than zero, with at most three decimal places.';
export const PRICE_INVALID = 'The price for one must be more than zero, with at most two decimal places.';
export const AMOUNT_TOO_SMALL = 'That quantity and price come to less than one cent.';
export const AMOUNT_TOO_LARGE = 'That quantity and price come to more than KSh 20 million.';
export const DETAIL_NOT_KEPT =
  'The expense was saved with its amount, but its quantity, price and receipt number were not kept: ' +
  'the system is still updating. In a few minutes, reload the page, delete this expense and add it again.';

/** What the form holds while it is being typed: every box is text. */
export type ExpenseFormValues = {
  category: ExpenseCategory;
  description: string;
  date: string; // YYYY-MM-DD
  quantity: string;
  unit: string;
  priceKes: string;
  amountKes: string;
  receiptRef: string;
};

export const blankExpenseForm = (today: string): ExpenseFormValues => ({
  category: 'TRANSPORT',
  description: '',
  date: today,
  quantity: '',
  unit: '',
  priceKes: '',
  amountKes: '',
  receiptRef: '',
});

/**
 * A typed number as a whole count of its smallest part: "2.5" with three
 * places is 2500. Digits only, with one optional point, read without floating
 * point. Null when it is not a number, has more decimals than `places`, or is
 * too long to be an amount.
 */
function parseScaled(text: string, places: number): number | null {
  const m = /^(\d{0,10})(?:\.(\d*))?$/.exec(text.trim());
  if (!m) return null;
  const whole = m[1] ?? '';
  const decimals = m[2] ?? '';
  if (whole === '' && decimals === '') return null;
  if (decimals.length > places) return null;
  return Number(whole || '0') * 10 ** places + Number(decimals.padEnd(places, '0') || '0');
}

/** A typed quantity in thousandths, or null when it is not one above zero and within a million. */
export function parseQuantity(text: string): number | null {
  const thousandths = parseScaled(text, 3);
  return thousandths !== null && thousandths > 0 && thousandths <= MAX_QUANTITY_THOUSANDTHS ? thousandths : null;
}

/** A typed KSh amount in cents, or null when it is not one above zero and within KSh 20 million. */
export function parseKes(text: string): number | null {
  const cents = parseScaled(text, 2);
  return cents !== null && cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/**
 * Quantity times the price for one, to the nearest cent, half a cent going up.
 * Whole numbers throughout, the same sum the server works.
 */
export function lineAmountCents(quantityThousandths: number, unitPriceCents: number): number {
  const whole = Math.floor(quantityThousandths / THOUSANDTHS);
  const part = quantityThousandths % THOUSANDTHS;
  return whole * unitPriceCents + Math.floor((part * unitPriceCents + THOUSANDTHS / 2) / THOUSANDTHS);
}

/** How the form's amount box stands: typed by hand, worked out, or waiting for the other half of a quantity and price. */
export type AmountState =
  | { kind: 'typed' }
  | { kind: 'worked'; cents: number; quantityThousandths: number; unitPriceCents: number }
  | { kind: 'waiting' };

export function amountState(form: Pick<ExpenseFormValues, 'quantity' | 'priceKes'>): AmountState {
  if (form.quantity.trim() === '' && form.priceKes.trim() === '') return { kind: 'typed' };
  const quantityThousandths = parseQuantity(form.quantity);
  const unitPriceCents = parseKes(form.priceKes);
  if (quantityThousandths === null || unitPriceCents === null) return { kind: 'waiting' };
  const cents = lineAmountCents(quantityThousandths, unitPriceCents);
  if (cents < 1 || cents > MAX_AMOUNT_CENTS) return { kind: 'waiting' };
  return { kind: 'worked', cents, quantityThousandths, unitPriceCents };
}

/** The form as the request to save it, or the sentence that says what to put right. */
export function readExpenseForm(form: ExpenseFormValues): { input: CreateExpenseInput } | { error: string } {
  const description = form.description.trim() || undefined;
  const receiptRef = form.receiptRef.trim() || undefined;
  const unit = form.unit.trim() || undefined;
  const common = { category: form.category, description, date: form.date, ...(receiptRef && { receiptRef }) };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return { error: DATE_NEEDED };

  const hasQuantity = form.quantity.trim() !== '';
  const hasPrice = form.priceKes.trim() !== '';
  if (!hasQuantity && !hasPrice) {
    if (unit) return { error: UNIT_NEEDS_QUANTITY };
    if (form.amountKes.trim() === '') return { error: AMOUNT_NEEDED };
    const amountCents = parseKes(form.amountKes);
    if (amountCents === null) return { error: AMOUNT_INVALID };
    return { input: { ...common, amountCents } };
  }
  if (!hasQuantity || !hasPrice) return { error: QUANTITY_NEEDS_PRICE };

  const quantityThousandths = parseQuantity(form.quantity);
  if (quantityThousandths === null) return { error: QUANTITY_INVALID };
  const unitPriceCents = parseKes(form.priceKes);
  if (unitPriceCents === null) return { error: PRICE_INVALID };
  const amountCents = lineAmountCents(quantityThousandths, unitPriceCents);
  if (amountCents < 1) return { error: AMOUNT_TOO_SMALL };
  if (amountCents > MAX_AMOUNT_CENTS) return { error: AMOUNT_TOO_LARGE };
  return { input: { ...common, amountCents, quantityThousandths, ...(unit && { unit }), unitPriceCents } };
}

type Detail = Pick<ExpenseDto, 'quantityThousandths' | 'unit' | 'unitPriceCents'>;

/** "4 litres", "2.5 kg", "1,200 pieces", or "4" with no unit. */
export function quantityText(quantityThousandths: number, unit?: string | null): string {
  const count = (quantityThousandths / THOUSANDTHS).toLocaleString('en-KE', { maximumFractionDigits: 3 });
  return unit ? `${count} ${unit}` : count;
}

/** "4 litres × KSh 250", or null for an expense typed as one amount. */
export function lineDetailText(expense: Detail): string | null {
  if (expense.quantityThousandths == null || expense.unitPriceCents == null) return null;
  return `${quantityText(expense.quantityThousandths, expense.unit)} × ${money(expense.unitPriceCents)}`;
}

/**
 * True when the server answered with less than was sent: a server from before
 * these details saves the amount and silently drops the rest. It can be the
 * one running for a few minutes while a new version is being put live.
 */
export function detailNotKept(sent: CreateExpenseInput, saved: ExpenseDto): boolean {
  return (
    (sent.quantityThousandths !== undefined && saved.quantityThousandths == null) ||
    (sent.receiptRef !== undefined && !saved.receiptRef)
  );
}
