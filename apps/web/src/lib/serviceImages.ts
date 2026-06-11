import type { ServiceLineCode } from '@onyxhawk/types';

/**
 * Service photos — free, commercial-use stock from Pexels (relevant to each
 * service). Placeholders until OnyxHawk has its own photography; swap a URL
 * here, or set `imageUrl` on the ServiceLine row in the DB, and the UI uses it.
 */
const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;
// Keyword-matched fallback for services without a curated Pexels shot yet.
const lf = (kw: string, lock: number) => `https://loremflickr.com/600/400/${kw}?lock=${lock}`;

export const serviceImage: Record<ServiceLineCode, string> = {
  residential: px(8055825), // people cleaning a home
  office: px(6197123), // professional cleaner in uniform
  hospital: px(6196566), // mopping / floor sanitation
  post_build: px(8853470), // construction worker on site
  fumigation: px(4008518), // spraying / disinfecting
  sofa: px(4401538), // vacuuming a sofa
  carpet: px(9462139), // vacuuming a carpet
  mattress: lf('mattress,bed', 81),
  curtain: lf('curtains,window', 82),
  ac_duct: lf('air,conditioner', 83),
  mould: lf('cleaning,wall', 84),
};

/** Hero banner image for the landing page. */
export const heroImage = px(8055825);

/** Prefer a DB-provided imageUrl, else the themed stock photo. */
export function imageForService(code: string, dbImageUrl?: string | null): string {
  return dbImageUrl || serviceImage[code as ServiceLineCode] || px(8055825);
}
