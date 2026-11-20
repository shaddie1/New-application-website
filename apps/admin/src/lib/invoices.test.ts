import { describe, expect, it } from 'vitest';

import { dayLabel, daysOf, emptyLine, formTotalCents, halfDaysOf, invoiceChip, lineFormOf, linesFromForm } from './invoices';

describe('invoiceChip', () => {
  it('says overdue before anything else', () => {
    expect(invoiceChip({ status: 'SENT', isOverdue: true }).label).toBe('Overdue');
    expect(invoiceChip({ status: 'SENT', isOverdue: false }).label).toBe('Sent');
    expect(invoiceChip({ status: 'PAID', isOverdue: false }).label).toBe('Paid');
  });
});

describe('the draft form', () => {
  it('shows a stored line in shillings and reads it back', () => {
    const form = lineFormOf({ description: 'Deep clean (6 Feb)', quantity: 1, unitCents: 800_000, amountCents: 800_000 });
    expect(form).toEqual({ description: 'Deep clean (6 Feb)', quantity: '1', unitShillings: '8000' });
    expect(linesFromForm([form])).toEqual({
      lines: [{ description: 'Deep clean (6 Feb)', quantity: 1, unitCents: 800_000, amountCents: 800_000 }],
    });
  });

  it('accepts commas, skips empty rows and adds up the total', () => {
    const form = [
      { description: 'Cleaning service', quantity: '2', unitShillings: '12,500' },
      emptyLine(),
    ];
    expect(linesFromForm(form)).toEqual({
      lines: [{ description: 'Cleaning service', quantity: 2, unitCents: 1_250_000, amountCents: 2_500_000 }],
    });
    expect(formTotalCents(form)).toBe(2_500_000);
  });

  it('says what is wrong in plain words', () => {
    expect(linesFromForm([emptyLine()])).toEqual({ problem: 'Add at least one line.' });
    expect(linesFromForm([{ description: '', quantity: '1', unitShillings: '500' }])).toEqual({ problem: 'Each line needs a description.' });
    expect(linesFromForm([{ description: 'Extra', quantity: '0', unitShillings: '500' }])).toEqual({
      problem: '“Extra”: the quantity must be a whole number, 1 or more.',
    });
    expect(linesFromForm([{ description: 'Extra', quantity: '1', unitShillings: 'abc' }])).toEqual({
      problem: '“Extra”: give the price in shillings.',
    });
  });
});

describe('dayLabel', () => {
  it('writes a date the way the invoice shows it', () => {
    expect(dayLabel('2027-02-12')).toBe('12 Feb 2027');
  });
});

describe('machine days on the payment form', () => {
  it('reads whole and half days, and an empty box as none', () => {
    expect(['3', '2.5', ' 0 ', ''].map(halfDaysOf)).toEqual([6, 5, 0, 0]);
  });

  it('refuses anything that is not a whole or half day', () => {
    expect(['1.25', '-1', 'two'].map(halfDaysOf)).toEqual([null, null, null]);
  });

  it('shows half days as days', () => {
    expect([6, 5, 0].map(daysOf)).toEqual(['3', '2.5', '0']);
  });
});
