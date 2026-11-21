import { describe, expect, it } from 'vitest';
import type { ExpenseDto } from '@onyxhawk/types';

import {
  AMOUNT_INVALID,
  AMOUNT_NEEDED,
  AMOUNT_TOO_LARGE,
  AMOUNT_TOO_SMALL,
  DATE_NEEDED,
  PRICE_INVALID,
  QUANTITY_INVALID,
  QUANTITY_NEEDS_PRICE,
  UNIT_NEEDS_QUANTITY,
  amountState,
  blankExpenseForm,
  detailNotKept,
  lineAmountCents,
  lineDetailText,
  parseKes,
  parseQuantity,
  quantityText,
  readExpenseForm,
} from './expenseLine';

const blank = blankExpenseForm('2026-11-21');
/** 4 litres of bleach at KSh 250. */
const bleach = { ...blank, category: 'MATERIALS' as const, description: 'Bleach', quantity: '4', unit: 'litres', priceKes: '250' };

describe('parseQuantity', () => {
  it('reads whole numbers and up to three decimals, in thousandths', () => {
    expect(parseQuantity('4')).toBe(4_000);
    expect(parseQuantity('2.5')).toBe(2_500);
    expect(parseQuantity('0.125')).toBe(125);
    expect(parseQuantity('.5')).toBe(500);
    expect(parseQuantity('4.')).toBe(4_000);
    expect(parseQuantity(' 12 ')).toBe(12_000);
    expect(parseQuantity('1000000')).toBe(1_000_000_000);
  });

  it.each(['', ' ', '0', '0.000', '-4', '+4', '2.5.1', '1.2345', 'four', '1e3', '4 litres', '1,000', '.', '1000000.001'])(
    'refuses %j',
    (text) => {
      expect(parseQuantity(text)).toBeNull();
    },
  );
});

describe('parseKes', () => {
  it('reads shillings and cents, in cents', () => {
    expect(parseKes('250')).toBe(25_000);
    expect(parseKes('120.5')).toBe(12_050);
    expect(parseKes('120.50')).toBe(12_050);
    expect(parseKes('0.01')).toBe(1);
    // 19.99 is not exact in floating point; it is read digit by digit.
    expect(parseKes('19.99')).toBe(1_999);
    expect(parseKes('20000000')).toBe(2_000_000_000);
  });

  it.each(['', '0', '0.00', '-250', '250.555', 'KSh 250', '1,200', '20000000.01', '99999999999'])('refuses %j', (text) => {
    expect(parseKes(text)).toBeNull();
  });
});

describe('lineAmountCents', () => {
  it('is quantity times price, to the nearest cent, half a cent going up', () => {
    expect(lineAmountCents(4_000, 25_000)).toBe(100_000);
    expect(lineAmountCents(2_500, 12_050)).toBe(30_125);
    expect(lineAmountCents(333, 100)).toBe(33);
    expect(lineAmountCents(335, 100)).toBe(34);
    expect(lineAmountCents(1_005, 100)).toBe(101);
    expect(lineAmountCents(4, 100)).toBe(0);
  });

  it('stays exact at the largest quantity and price the form takes', () => {
    expect(lineAmountCents(1_000_000_000, 2_000_000_000)).toBe(2_000_000_000_000_000);
    expect(lineAmountCents(999_999_999, 1_999_999_999)).toBe(1_999_997_999_000_001 + 1_997_999_999);
  });
});

describe('amountState', () => {
  it('is typed by hand while quantity and price are both empty', () => {
    expect(amountState(blank)).toEqual({ kind: 'typed' });
    expect(amountState({ quantity: '  ', priceKes: '' })).toEqual({ kind: 'typed' });
  });

  it('is worked out once both are filled in', () => {
    expect(amountState(bleach)).toEqual({ kind: 'worked', cents: 100_000, quantityThousandths: 4_000, unitPriceCents: 25_000 });
    expect(amountState({ quantity: '2.5', priceKes: '120.50' })).toMatchObject({ kind: 'worked', cents: 30_125 });
  });

  it('waits while only one is filled in, or one cannot be read, or they come to too little or too much', () => {
    expect(amountState({ quantity: '4', priceKes: '' })).toEqual({ kind: 'waiting' });
    expect(amountState({ quantity: '', priceKes: '250' })).toEqual({ kind: 'waiting' });
    expect(amountState({ quantity: 'four', priceKes: '250' })).toEqual({ kind: 'waiting' });
    expect(amountState({ quantity: '0.001', priceKes: '0.01' })).toEqual({ kind: 'waiting' });
    expect(amountState({ quantity: '3', priceKes: '10000000' })).toEqual({ kind: 'waiting' });
  });
});

describe('readExpenseForm', () => {
  const refusal = (form: typeof blank) => {
    const read = readExpenseForm(form);
    return 'error' in read ? read.error : null;
  };

  it('reads one typed amount as before: category, amount, date and description only', () => {
    expect(readExpenseForm({ ...blank, amountKes: '500', description: ' Matatu to Karen ' })).toStrictEqual({
      input: { category: 'TRANSPORT', description: 'Matatu to Karen', date: '2026-11-21', amountCents: 50_000 },
    });
    expect(readExpenseForm({ ...blank, amountKes: '200' })).toStrictEqual({
      input: { category: 'TRANSPORT', description: undefined, date: '2026-11-21', amountCents: 20_000 },
    });
  });

  it('works the amount out from a quantity and a price, whatever was typed in the amount box before', () => {
    expect(readExpenseForm({ ...bleach, amountKes: '999', receiptRef: ' QK7H2M4X1P ' })).toStrictEqual({
      input: {
        category: 'MATERIALS', description: 'Bleach', date: '2026-11-21', receiptRef: 'QK7H2M4X1P',
        amountCents: 100_000, quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000,
      },
    });
  });

  it('leaves out a blank unit and a blank receipt number', () => {
    expect(readExpenseForm({ ...bleach, unit: '  ' })).toStrictEqual({
      input: {
        category: 'MATERIALS', description: 'Bleach', date: '2026-11-21',
        amountCents: 100_000, quantityThousandths: 4_000, unitPriceCents: 25_000,
      },
    });
  });

  it('takes a receipt number on one typed amount', () => {
    expect(readExpenseForm({ ...blank, amountKes: '500', receiptRef: 'RCPT-118' })).toMatchObject({
      input: { amountCents: 50_000, receiptRef: 'RCPT-118' },
    });
  });

  it('says what to put right', () => {
    expect(refusal(blank)).toBe(AMOUNT_NEEDED);
    expect(refusal({ ...blank, amountKes: '0' })).toBe(AMOUNT_INVALID);
    expect(refusal({ ...blank, amountKes: '-500' })).toBe(AMOUNT_INVALID);
    expect(refusal({ ...blank, amountKes: 'five hundred' })).toBe(AMOUNT_INVALID);
    expect(refusal({ ...blank, amountKes: '500', date: '' })).toBe(DATE_NEEDED);
    expect(refusal({ ...blank, amountKes: '500', unit: 'litres' })).toBe(UNIT_NEEDS_QUANTITY);
    expect(refusal({ ...blank, amountKes: '500', quantity: '4' })).toBe(QUANTITY_NEEDS_PRICE);
    expect(refusal({ ...blank, amountKes: '500', priceKes: '250' })).toBe(QUANTITY_NEEDS_PRICE);
    expect(refusal({ ...bleach, quantity: '0' })).toBe(QUANTITY_INVALID);
    expect(refusal({ ...bleach, quantity: '-4' })).toBe(QUANTITY_INVALID);
    expect(refusal({ ...bleach, quantity: '1.2345' })).toBe(QUANTITY_INVALID);
    expect(refusal({ ...bleach, priceKes: '0' })).toBe(PRICE_INVALID);
    expect(refusal({ ...bleach, priceKes: '-250' })).toBe(PRICE_INVALID);
    expect(refusal({ ...bleach, priceKes: '250.555' })).toBe(PRICE_INVALID);
    expect(refusal({ ...bleach, quantity: '0.001', priceKes: '0.01' })).toBe(AMOUNT_TOO_SMALL);
    expect(refusal({ ...bleach, quantity: '3', priceKes: '10000000' })).toBe(AMOUNT_TOO_LARGE);
  });
});

describe('what a list shows', () => {
  it('writes a quantity with its unit, without trailing zeros', () => {
    expect(quantityText(4_000, 'litres')).toBe('4 litres');
    expect(quantityText(2_500, 'kg')).toBe('2.5 kg');
    expect(quantityText(125)).toBe('0.125');
    expect(quantityText(1_200_000, 'pieces')).toBe('1,200 pieces');
    expect(quantityText(4_000, null)).toBe('4');
  });

  it('writes what an amount is made of', () => {
    expect(lineDetailText({ quantityThousandths: 4_000, unit: 'litres', unitPriceCents: 25_000 })).toBe('4 litres × KSh 250');
    expect(lineDetailText({ quantityThousandths: 2_500, unit: 'kg', unitPriceCents: 12_050 })).toBe('2.5 kg × KSh 120.50');
    expect(lineDetailText({ quantityThousandths: 3_000, unitPriceCents: 150_000 })).toBe('3 × KSh 1,500');
  });

  it('writes nothing for an expense typed as one amount, or one from an older server', () => {
    expect(lineDetailText({})).toBeNull();
    expect(lineDetailText({ unit: 'litres' })).toBeNull();
    expect(lineDetailText({ quantityThousandths: 4_000 })).toBeNull();
  });
});

describe('detailNotKept', () => {
  const saved: ExpenseDto = {
    id: 'e1', category: 'MATERIALS', amountCents: 100_000, description: 'Bleach', date: '2026-11-21',
    jobId: 'j1', bookingId: null, createdAt: '2026-11-21T09:30:00.000Z',
  };
  const sent = { category: 'MATERIALS' as const, amountCents: 100_000, date: '2026-11-21' };
  const detail = { quantityThousandths: 4_000, unitPriceCents: 25_000 };

  it('is false when what was sent came back', () => {
    expect(detailNotKept(sent, saved)).toBe(false);
    expect(detailNotKept({ ...sent, ...detail }, { ...saved, ...detail })).toBe(false);
    expect(detailNotKept({ ...sent, receiptRef: 'RCPT-118' }, { ...saved, receiptRef: 'RCPT-118' })).toBe(false);
  });

  it('is true when a quantity or a receipt number was sent and did not come back', () => {
    expect(detailNotKept({ ...sent, ...detail }, saved)).toBe(true);
    expect(detailNotKept({ ...sent, receiptRef: 'RCPT-118' }, saved)).toBe(true);
  });
});
