import { describe, expect, it } from 'vitest';

import { ATTENTION_CARDS, attentionView } from './attention';

/** The four counters, then bookings to assign and unpaid bookings past their date. */
const stats = (
  pendingPayment: number,
  confirmed: number,
  inProgress: number,
  pendingQuotes: number,
  unassignedBookings: number,
  unpaidPastDate: number,
) => ({ pendingPayment, confirmed, inProgress, pendingQuotes, unassignedBookings, unpaidPastDate });

describe('attentionView', () => {
  it('shows the strip and one line in place of the cards when three bookings are confirmed with crews', () => {
    expect(attentionView(stats(0, 3, 0, 0, 0, 0))).toEqual({ kind: 'work', strip: true, cards: [] });
  });

  it('is the one friendly state when all six numbers are zero', () => {
    expect(attentionView(stats(0, 0, 0, 0, 0, 0))).toEqual({ kind: 'all-clear' });
  });

  it('shows each card only when its own count is above zero, in a fixed order', () => {
    expect(attentionView(stats(1, 2, 0, 2, 1, 1))).toEqual({
      kind: 'work',
      strip: true,
      cards: [
        { key: 'bookings-to-assign', count: 1 },
        { key: 'quotes-to-price', count: 2 },
        { key: 'unpaid-past-date', count: 1 },
      ],
    });
    expect(attentionView(stats(0, 0, 0, 4, 0, 0))).toEqual({
      kind: 'work',
      strip: true,
      cards: [{ key: 'quotes-to-price', count: 4 }],
    });
  });

  it('hides the strip and shows the one card when only an unpaid booking past its date is counted', () => {
    expect(attentionView(stats(0, 0, 0, 0, 0, 1))).toEqual({
      kind: 'work',
      strip: false,
      cards: [{ key: 'unpaid-past-date', count: 1 }],
    });
  });

  it('shows all three cards, the two bookings cards without a count, when the server sends neither new count', () => {
    const fromAnOlderServer = { pendingPayment: 1, confirmed: 2, inProgress: 0, pendingQuotes: 2 };
    expect(attentionView(fromAnOlderServer)).toEqual({
      kind: 'work',
      strip: true,
      cards: [{ key: 'bookings-to-assign' }, { key: 'quotes-to-price', count: 2 }, { key: 'unpaid-past-date' }],
    });
  });

  it('never calls it all clear on counts the server did not send', () => {
    const fromAnOlderServer = { pendingPayment: 0, confirmed: 0, inProgress: 0, pendingQuotes: 0 };
    const view = attentionView(fromAnOlderServer);
    expect(view).toMatchObject({ kind: 'work', strip: false });
    expect(view.kind === 'work' && view.cards.map((card) => card.key)).toEqual([
      'bookings-to-assign',
      'quotes-to-price',
      'unpaid-past-date',
    ]);
  });
});

describe('ATTENTION_CARDS', () => {
  it('sends each bookings card to the Bookings page filtered to its status, and the quotes card to Quotes', () => {
    expect(ATTENTION_CARDS['bookings-to-assign'].href).toBe('/bookings?status=CONFIRMED');
    expect(ATTENTION_CARDS['unpaid-past-date'].href).toBe('/bookings?status=PENDING_PAYMENT');
    expect(ATTENTION_CARDS['quotes-to-price'].href).toBe('/quotes');
  });

  it('names the cards as the owner settled them', () => {
    expect(ATTENTION_CARDS['bookings-to-assign'].title).toBe('Bookings to assign');
    expect(ATTENTION_CARDS['quotes-to-price'].title).toBe('Quotes to price');
    expect(ATTENTION_CARDS['unpaid-past-date'].title).toBe('Unpaid bookings past their date');
  });
});
