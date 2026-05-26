import { create } from 'zustand';
import type { CleanTypeCode, ServiceLineCode } from '@onyxhawk/types';

/**
 * In-flight booking draft, held while the user moves through screens 04 → 07.
 * Reset when the user lands on the confirmation screen successfully or backs
 * out to home.
 */
export interface BookingDraft {
  serviceLineCode: ServiceLineCode | null;
  serviceLineName: string | null;       // for header chip & confirmation copy
  serviceLineColorHex: string | null;
  cleanTypeCode: CleanTypeCode | null;
  cleanTypeName: string | null;

  bedrooms: number;
  bathrooms: number;
  livingRooms: number;
  squareMeters: number | null;

  addOnCodes: string[];

  addressId: string | null;
  scheduledAt: string | null; // ISO
  notesForCrew: string | null;
}

const EMPTY: BookingDraft = {
  serviceLineCode: null,
  serviceLineName: null,
  serviceLineColorHex: null,
  cleanTypeCode: null,
  cleanTypeName: null,
  bedrooms: 1,
  bathrooms: 1,
  livingRooms: 1,
  squareMeters: null,
  addOnCodes: [],
  addressId: null,
  scheduledAt: null,
  notesForCrew: null,
};

interface BookingState {
  draft: BookingDraft;
  setServiceLine: (input: Pick<BookingDraft, 'serviceLineCode' | 'serviceLineName' | 'serviceLineColorHex'>) => void;
  setCleanType: (input: Pick<BookingDraft, 'cleanTypeCode' | 'cleanTypeName'>) => void;
  setScope: (input: Pick<BookingDraft, 'bedrooms' | 'bathrooms' | 'livingRooms' | 'squareMeters'>) => void;
  toggleAddOn: (code: string) => void;
  setSchedule: (input: { addressId: string; scheduledAt: string; notesForCrew?: string | null }) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  draft: EMPTY,
  setServiceLine: (input) =>
    set((s) => ({ draft: { ...s.draft, ...input, cleanTypeCode: null, cleanTypeName: null, addOnCodes: [] } })),
  setCleanType: (input) => set((s) => ({ draft: { ...s.draft, ...input } })),
  setScope: (input) => set((s) => ({ draft: { ...s.draft, ...input } })),
  toggleAddOn: (code) =>
    set((s) => ({
      draft: {
        ...s.draft,
        addOnCodes: s.draft.addOnCodes.includes(code)
          ? s.draft.addOnCodes.filter((c) => c !== code)
          : [...s.draft.addOnCodes, code],
      },
    })),
  setSchedule: ({ addressId, scheduledAt, notesForCrew }) =>
    set((s) => ({ draft: { ...s.draft, addressId, scheduledAt, notesForCrew: notesForCrew ?? null } })),
  reset: () => set({ draft: EMPTY }),
}));
