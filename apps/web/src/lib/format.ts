import type { BookingStatus, PaymentStatus } from '@onyxhawk/types';

/** KES cents → "KSh 3,200". */
export function money(cents: number): string {
  const ksh = Math.round(cents) / 100;
  return `KSh ${ksh.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: 'Africa/Nairobi',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: 'Africa/Nairobi',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', DATE_OPTS);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', TIME_OPTS);
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** Minutes → "2h 30m" / "45m". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  DRAFT: 'Draft',
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  EN_ROUTE: 'Crew en route',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

export function bookingStatusLabel(s: BookingStatus): string {
  return BOOKING_STATUS_LABEL[s] ?? s;
}

/** Tailwind classes for the booking-status pill. */
export function bookingStatusTone(s: BookingStatus): string {
  switch (s) {
    case 'COMPLETED':
      return 'bg-success/15 text-success';
    case 'CONFIRMED':
    case 'EN_ROUTE':
    case 'IN_PROGRESS':
      return 'bg-gold-soft text-gold-deep';
    case 'PENDING_PAYMENT':
      return 'bg-warning/15 text-warning';
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'bg-danger/15 text-danger';
    default:
      return 'bg-bg-muted text-text-muted';
  }
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  REQUESTED: 'Requested',
  AWAITING_USER: 'Awaiting your M-Pesa PIN',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  TIMED_OUT: 'Timed out',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

export function paymentStatusLabel(s: PaymentStatus): string {
  return PAYMENT_STATUS_LABEL[s] ?? s;
}
