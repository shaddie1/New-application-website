/** Admin/back-office DTOs (apps/admin). */
import type { BookingDto } from './booking.js';
import type { QuoteRequestDto, QuoteStatus } from './quote.js';
import type { UserRole } from './auth.js';

export interface CrewMemberSummary {
  userId: string;
  name: string;
  role: 'LEAD' | 'MEMBER';
}

export interface AdminBookingDto extends BookingDto {
  customerName: string;
  customerPhone: string;
  crew: CrewMemberSummary[];
}

export interface AssignCrewInput {
  userId: string;
  role: 'LEAD' | 'MEMBER';
}

/** Crew users available for assignment. */
export interface CrewUserDto {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole; // CREW | CREW_LEAD
}

export interface AdminQuoteRequestDto extends QuoteRequestDto {
  customerName: string;
  customerPhone: string;
}

export interface RespondQuoteInput {
  status: QuoteStatus;
  quotedAmountCents?: number;
}

export interface AdminStats {
  pendingPayment: number;
  confirmed: number;
  inProgress: number;
  pendingQuotes: number;
}

export interface AdminBookingsResult {
  bookings: AdminBookingDto[];
}

export interface AdminQuotesResult {
  quoteRequests: AdminQuoteRequestDto[];
}
