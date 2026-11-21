import { describe, expect, it } from 'vitest';

import {
  AMOUNT_MISMATCH,
  AMOUNT_TOO_LARGE,
  AMOUNT_TOO_SMALL,
  MAX_AMOUNT_CENTS,
  MAX_QUANTITY_THOUSANDTHS,
  QUANTITY_NEEDS_PRICE,
  UNIT_NEEDS_QUANTITY,
  lineAmountCents,
  readExpenseLine,
  toExpenseDto,
} from './line.js';

// An expense's amount is the figure every total adds up. A quantity and a
// price for one explain it, and the amount is their product to the nearest cent.

describe('lineAmountCents', () => {
  it('multiplies a whole quantity by the price for one', () => {
    // 4 litres at KSh 250.
    expect(lineAmountCents(4_000, 25_000)).toBe(100_000);
    expect(lineAmountCents(1_000, 1)).toBe(1);
  });

  it('counts a part of a unit', () => {
    // Two and a half kilos at KSh 120.50.
    expect(lineAmountCents(2_500, 12_050)).toBe(30_125);
    // Half a day at KSh 1,500.
    expect(lineAmountCents(500, 150_000)).toBe(75_000);
  });

  it('rounds to the nearest cent, half a cent going up', () => {
    // A third of a unit at KSh 1: 33.3 cents.
    expect(lineAmountCents(333, 100)).toBe(33);
    // 0.335 of a unit at KSh 1: 33.5 cents.
    expect(lineAmountCents(335, 100)).toBe(34);
    // 1.005 units at KSh 1: 100.5 cents.
    expect(lineAmountCents(1_005, 100)).toBe(101);
    // 0.004 of a unit at KSh 1: 0.4 of a cent.
    expect(lineAmountCents(4, 100)).toBe(0);
    // 0.005 of a unit at KSh 1: half a cent.
    expect(lineAmountCents(5, 100)).toBe(1);
  });

  it('stays exact at the largest quantity and the largest price', () => {
    // A million units at KSh 20 million each: 2 followed by 15 zeros, in cents.
    expect(lineAmountCents(MAX_QUANTITY_THOUSANDTHS, MAX_AMOUNT_CENTS)).toBe(2_000_000_000_000_000);
    // One thousandth short of a million units at one cent under KSh 20 million.
    // Worked by hand: 999,999 x 1,999,999,999 + round(0.999 x 1,999,999,999).
    expect(lineAmountCents(MAX_QUANTITY_THOUSANDTHS - 1, MAX_AMOUNT_CENTS - 1))
      .toBe(1_999_997_999_000_001 + 1_997_999_999);
  });
});

const lumpSum = { category: 'TRANSPORT', amountCents: 50_000, date: '2026-11-21' };
const bleach = {
  category: 'MATERIALS', amountCents: 100_000, date: '2026-11-21', description: 'Bleach',
  quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000,
};
const refusal = (body: unknown) => {
  const read = readExpenseLine(body);
  return 'error' in read ? read.error : null;
};

describe('readExpenseLine', () => {
  it('reads an expense typed as one amount, with no quantity, unit or price', () => {
    expect(readExpenseLine(lumpSum)).toEqual({
      line: {
        category: 'TRANSPORT', amountCents: 50_000, description: undefined, date: new Date('2026-11-21T00:00:00.000Z'),
        quantityThousandths: null, unit: null, unitPriceCents: null, receiptRef: null,
      },
    });
  });

  it('reads a quantity, a unit, a price for one and a receipt number', () => {
    expect(readExpenseLine({ ...bleach, receiptRef: ' QK7H2M4X1P ' })).toEqual({
      line: {
        category: 'MATERIALS', amountCents: 100_000, description: 'Bleach', date: new Date('2026-11-21T00:00:00.000Z'),
        quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
      },
    });
  });

  it('takes a quantity and a price with no unit, and a blank unit as none', () => {
    const { unit: _unit, ...noUnit } = bleach;
    expect(readExpenseLine(noUnit)).toMatchObject({ line: { quantityThousandths: 4_000, unit: null, unitPriceCents: 25_000 } });
    expect(readExpenseLine({ ...bleach, unit: '   ' })).toMatchObject({ line: { unit: null } });
  });

  it('takes a receipt number on a lump sum, and a blank one as none', () => {
    expect(readExpenseLine({ ...lumpSum, receiptRef: 'RCPT-118' })).toMatchObject({ line: { receiptRef: 'RCPT-118' } });
    expect(readExpenseLine({ ...lumpSum, receiptRef: '  ' })).toMatchObject({ line: { receiptRef: null } });
  });

  it('refuses a quantity without a price, and a price without a quantity', () => {
    expect(refusal({ ...lumpSum, quantityThousandths: 4_000 })).toBe(QUANTITY_NEEDS_PRICE);
    expect(refusal({ ...lumpSum, unitPriceCents: 25_000 })).toBe(QUANTITY_NEEDS_PRICE);
  });

  it('refuses a unit with no quantity', () => {
    expect(refusal({ ...lumpSum, unit: 'litres' })).toBe(UNIT_NEEDS_QUANTITY);
  });

  it('refuses an amount that is not the quantity times the price', () => {
    expect(refusal({ ...bleach, amountCents: 100_001 })).toBe(AMOUNT_MISMATCH);
    expect(refusal({ ...bleach, amountCents: 99_999 })).toBe(AMOUNT_MISMATCH);
    // Rounded down where the rule rounds up: 0.335 of a unit at KSh 1 is 34 cents.
    expect(refusal({ ...lumpSum, amountCents: 33, quantityThousandths: 335, unitPriceCents: 100 })).toBe(AMOUNT_MISMATCH);
    expect(refusal({ ...lumpSum, amountCents: 34, quantityThousandths: 335, unitPriceCents: 100 })).toBeNull();
  });

  it.each([0, -1, -4_000, 2.5, MAX_QUANTITY_THOUSANDTHS + 1])('refuses a quantity of %d thousandths', (quantityThousandths) => {
    expect(refusal({ ...bleach, quantityThousandths }))
      .toBe('The quantity must be more than zero, with at most three decimal places.');
  });

  it.each([0, -1, -25_000, 250.5])('refuses a price for one of %d cents', (unitPriceCents) => {
    expect(refusal({ ...bleach, unitPriceCents })).toBe('The price for one must be more than zero.');
  });

  it.each([0, -1, -50_000, 500.5, MAX_AMOUNT_CENTS + 1])('refuses an amount of %d cents', (amountCents) => {
    expect(refusal({ ...lumpSum, amountCents })).toBe('The amount must be more than zero, and at most KSh 20 million.');
    expect(refusal({ ...bleach, amountCents })).toBe('The amount must be more than zero, and at most KSh 20 million.');
  });

  it('refuses a quantity and price that come to less than one cent', () => {
    // 0.004 of a unit at KSh 1 is 0.4 of a cent. Any amount the form could send beside it is refused.
    expect(refusal({ ...lumpSum, amountCents: 1, quantityThousandths: 4, unitPriceCents: 100 })).toBe(AMOUNT_TOO_SMALL);
  });

  it('refuses a quantity and price that come to more than one expense can hold', () => {
    // 3 at KSh 10 million each.
    const tooMuch = { quantityThousandths: 3_000, unitPriceCents: 1_000_000_000 };
    expect(refusal({ ...lumpSum, ...tooMuch, amountCents: MAX_AMOUNT_CENTS })).toBe(AMOUNT_TOO_LARGE);
  });

  it('refuses text that is too long, a missing category and a date in the wrong form', () => {
    expect(refusal({ ...bleach, unit: 'x'.repeat(31) })).toBe('The unit can be at most 30 characters.');
    expect(refusal({ ...bleach, receiptRef: 'x'.repeat(201) })).toBe('The receipt number can be at most 200 characters.');
    expect(refusal({ ...bleach, description: 'x'.repeat(501) })).toBe('The item can be at most 500 characters.');
    expect(refusal({ ...bleach, category: 'FUEL' })).toBe('Choose a category for the expense.');
    expect(refusal({ ...bleach, date: '21/11/2026' })).toBe('Choose the date of the expense.');
    expect(refusal(null)).toBe('Check the expense and try again.');
  });
});

describe('toExpenseDto', () => {
  const row = {
    id: 'e1', category: 'MATERIALS' as const, amountCents: 100_000, description: 'Bleach',
    date: new Date('2026-11-21T00:00:00.000Z'), jobId: 'j1', bookingId: null, createdAt: new Date('2026-11-21T09:30:00.000Z'),
  };
  const before = {
    id: 'e1', category: 'MATERIALS', amountCents: 100_000, description: 'Bleach', date: '2026-11-21',
    jobId: 'j1', bookingId: null, createdAt: '2026-11-21T09:30:00.000Z',
  };

  it('sends an expense with no detail exactly as before: no new field at all', () => {
    const stored = { ...row, quantityThousandths: null, unit: null, unitPriceCents: null, receiptRef: null };
    expect(JSON.parse(JSON.stringify(toExpenseDto(stored)))).toStrictEqual(before);
    expect(JSON.parse(JSON.stringify(toExpenseDto(row)))).toStrictEqual(before);
  });

  it('sends the quantity, unit, price and receipt number an expense has', () => {
    const stored = { ...row, quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P' };
    expect(toExpenseDto(stored)).toStrictEqual({
      ...before, quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000, receiptRef: 'QK7H2M4X1P',
    });
  });

  it('sends a quantity and price without a unit, and a receipt number on a lump sum', () => {
    expect(toExpenseDto({ ...row, quantityThousandths: 500, unit: null, unitPriceCents: 150_000, receiptRef: null }))
      .toStrictEqual({ ...before, quantityThousandths: 500, unitPriceCents: 150_000 });
    expect(toExpenseDto({ ...row, quantityThousandths: null, unit: null, unitPriceCents: null, receiptRef: 'RCPT-118' }))
      .toStrictEqual({ ...before, receiptRef: 'RCPT-118' });
  });
});
