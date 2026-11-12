import { describe, expect, it } from 'vitest';

import { bookingStatusFilterFromSearch } from './booking-status-filter';

describe('bookingStatusFilterFromSearch', () => {
  it('opens on the status the address names', () => {
    expect(bookingStatusFilterFromSearch('?status=CONFIRMED')).toBe('CONFIRMED');
    expect(bookingStatusFilterFromSearch('?status=PENDING_PAYMENT')).toBe('PENDING_PAYMENT');
  });

  it('opens on "All" when the address names no status', () => {
    expect(bookingStatusFilterFromSearch('')).toBe('');
    expect(bookingStatusFilterFromSearch('?page=2')).toBe('');
  });

  it('opens on "All" when the address names a status the page has no filter for', () => {
    expect(bookingStatusFilterFromSearch('?status=PAID')).toBe('');
    expect(bookingStatusFilterFromSearch('?status=confirmed')).toBe('');
    expect(bookingStatusFilterFromSearch('?status=')).toBe('');
  });
});
