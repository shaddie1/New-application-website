/**
 * The Bookings page's status filters, and the one its address asks it to open
 * on. Kept free of React so the rule can be tested without a DOM.
 */
export const BOOKING_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'EN_ROUTE', label: 'En route' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

/** A filter's value: a booking status, or `''` for every booking. */
export type BookingStatusFilter = (typeof BOOKING_STATUS_FILTERS)[number]['value'];

/**
 * The filter the page opens on, from the query part of its address
 * (`window.location.search`). The Dashboard's cards link here with
 * `?status=CONFIRMED` and `?status=PENDING_PAYMENT`. An address that names no
 * status, or one the page has no filter for, opens on "All".
 */
export function bookingStatusFilterFromSearch(search: string): BookingStatusFilter {
  const asked = new URLSearchParams(search).get('status');
  return BOOKING_STATUS_FILTERS.find((filter) => filter.value === asked)?.value ?? '';
}
