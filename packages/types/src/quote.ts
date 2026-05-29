/** Quote-request DTOs (mockup 12) — for the quote-only service lines. */
import type { ServiceLineCode } from './booking.js';

export type QuoteFrequency = 'NONE' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export type QuoteStatus =
  | 'PENDING'
  | 'SITE_VISIT_SCHEDULED'
  | 'QUOTED'
  | 'WON'
  | 'LOST'
  | 'CANCELLED';

export interface CreateQuoteRequestInput {
  serviceLineCode: ServiceLineCode;
  siteType: string;            // "Open-plan office · 4 floors"
  approxSqm?: number;
  floors?: number;
  frequency: QuoteFrequency;
  notes?: string;
}

export interface QuoteRequestDto {
  id: string;
  serviceLineCode: ServiceLineCode;
  serviceLineName: string;
  siteType: string;
  approxSqm: number | null;
  floors: number | null;
  frequency: QuoteFrequency;
  notes: string | null;
  status: QuoteStatus;
  quotedAmountCents: number | null;
  quotedAt: string | null;
  createdAt: string;
}
