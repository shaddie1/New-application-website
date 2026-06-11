/** Subset of catalog + booking DTOs shared between API and clients. */

export type ServiceLineCode =
  | 'residential'
  | 'office'
  | 'hospital'
  | 'post_build'
  | 'fumigation'
  | 'sofa'
  | 'carpet'
  | 'mattress'
  | 'curtain'
  | 'ac_duct'
  | 'mould';

export type CleanTypeCode = 'standard' | 'deep' | 'move_out' | 'recurring';

export type ServiceBadge = 'NONE' | 'MOST_BOOKED' | 'CERTIFIED' | 'NEW';

export type BookingStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

// ── Catalog ───────────────────────────────────────────────────────────────

export interface ServiceLineDto {
  id: string;
  code: ServiceLineCode;
  name: string;
  tagline: string | null;
  badge: ServiceBadge;
  imageUrl: string | null;
  colorHex: string | null;
  quoteOnly: boolean;
  fromPriceCents: number | null;
}

export interface CleanTypeDto {
  id: string;
  code: CleanTypeCode;
  name: string;
  subtitle: string | null;
  basePriceCents: number;
}

export interface AddOnDto {
  id: string;
  code: string;
  name: string;
  priceCents: number;
}

// ── Addresses ─────────────────────────────────────────────────────────────

export interface AddressDto {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  area: string | null;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  accessNotes: string | null;
  isDefault: boolean;
}

export interface CreateAddressInput {
  label: string;
  line1: string;
  line2?: string;
  area?: string;
  city?: string;
  lat?: number;
  lng?: number;
  accessNotes?: string;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  label?: string;
  line1?: string;
  line2?: string | null;
  area?: string | null;
  city?: string;
  accessNotes?: string | null;
  isDefault?: boolean;
}

// ── Booking scope & pricing ───────────────────────────────────────────────

export interface BookingScope {
  bedrooms: number;
  bathrooms: number;
  livingRooms: number;
  squareMeters?: number;
  cleanTypeCode: CleanTypeCode;
  addOnCodes: string[];
}

export interface QuoteInput {
  serviceLineCode: ServiceLineCode;
  scope: BookingScope;
  addressId?: string;       // travel fee depends on the area
  scheduledAt?: string;     // weekend multiplier on points
}

export interface QuoteLineItem {
  label: string;            // "Deep clean · 3 bed / 2 bath" | "Inside fridge & oven" | "Travel · Westlands"
  amountCents: number;      // positive for charges, negative for credits
  kind: 'BASE' | 'ADDON' | 'TRAVEL' | 'CREDIT' | 'DISCOUNT';
}

export interface QuoteResult {
  serviceLineCode: ServiceLineCode;
  cleanTypeCode: CleanTypeCode;
  lineItems: QuoteLineItem[];
  subtotalCents: number;
  travelFeeCents: number;
  creditAppliedCents: number;
  discountCents: number;
  totalCents: number;
  estimatedDurationMinutes: number;
  pointsToEarn: number;
}

// ── Availability ──────────────────────────────────────────────────────────

export interface TimeSlot {
  startsAt: string; // ISO 8601, in user's timezone (Africa/Nairobi)
  available: boolean;
}

export interface AvailabilityResult {
  date: string;            // YYYY-MM-DD
  slots: TimeSlot[];
}

// ── Booking creation & retrieval ──────────────────────────────────────────

export interface CreateBookingInput {
  serviceLineCode: ServiceLineCode;
  scope: BookingScope;
  addressId: string;
  scheduledAt: string;     // ISO 8601
  notesForCrew?: string;
}

export interface BookingDto {
  id: string;
  reference: string;       // OH-YYMM-XXX
  status: BookingStatus;
  serviceLineCode: ServiceLineCode;
  cleanTypeCode: CleanTypeCode;
  scope: {
    bedrooms: number;
    bathrooms: number;
    livingRooms: number;
    squareMeters: number | null;
  };
  scheduledAt: string;
  estimatedDurationMinutes: number;
  basePriceCents: number;
  addOnsTotalCents: number;
  travelFeeCents: number;
  creditAppliedCents: number;
  discountCents: number;
  totalCents: number;
  pointsToEarn: number;
  notesForCrew: string | null;
  address: AddressDto;
  addOns: Array<{ id: string; code: string; name: string; priceCentsAtBooking: number }>;
  createdAt: string;
}

// ── Crew & transitions ────────────────────────────────────────────────────

/** Booking states the crew flow can advance to (subset of BookingStatus). */
export type CrewTransitionTo = 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED';

export interface TransitionBookingInput {
  to: CrewTransitionTo;
}

/** A booking as the assigned crew sees it (customer info + role on the job). */
export interface CrewJobDto extends BookingDto {
  customerName: string;
  customerPhone: string;
  crewRole: 'LEAD' | 'MEMBER';
}
