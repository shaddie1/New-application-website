import type { ServiceLineCode } from '@onyxhawk/types';

/**
 * Stock photos per service line. These are free, Creative-Commons images served
 * by LoremFlickr (keyword-matched, `lock` keeps each one stable). They're a
 * placeholder until OnyxHawk has its own photography — swap these URLs (or set
 * `imageUrl` on the ServiceLine rows in the DB) and the UI picks them up.
 */
const BASE = 'https://loremflickr.com/600/400';

export const serviceImage: Record<ServiceLineCode, string> = {
  residential: `${BASE}/cleaning,home?lock=11`,
  office: `${BASE}/office,cleaning?lock=22`,
  hospital: `${BASE}/hospital,clean?lock=33`,
  post_build: `${BASE}/construction,cleaning?lock=44`,
  fumigation: `${BASE}/pest,control?lock=55`,
};

/** Hero banner image for the landing page. */
export const heroImage = 'https://loremflickr.com/1600/900/cleaning,home?lock=7';

/** Prefer a DB-provided imageUrl, else the themed stock photo, else a generic clean. */
export function imageForService(code: string, dbImageUrl?: string | null): string {
  return dbImageUrl || serviceImage[code as ServiceLineCode] || `${BASE}/cleaning?lock=1`;
}
