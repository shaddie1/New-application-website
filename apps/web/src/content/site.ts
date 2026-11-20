/**
 * Marketing copy for the public site, in one place.
 *
 * Service entries carry the catalog `code` from the API so the cards can deep
 * link into the booking/quote flow — and so the marketing names stay tied to
 * the real catalog rather than drifting from it.
 */

import type { ClientSegment } from '@onyxhawk/types';

export const COMPANY = {
  name: 'OnyxHawk Cleaning Service',
  shortName: 'OnyxHawk',
  foundedYear: 2019,
  tagline: 'Professional cleaning, booked in minutes.',
  phoneDisplay: '+254 702 416 697',
  phoneE164: '+254702416697',
  whatsAppNumber: '254702416697',
  email: 'info@onyxhawkcleaningservice.com',
  addressLine: 'Hodamatt Building, Base Road, Roysambu',
  city: 'Nairobi, Kenya',
  postal: 'P.O. Box 73492 – 00200, Nairobi',
  hours: 'Mon–Sat, 7:00am – 7:00pm',
} as const;

export const WHATSAPP_LINK = `https://wa.me/${COMPANY.whatsAppNumber}?text=${encodeURIComponent(
  "Hi OnyxHawk, I'd like a cleaning quote.",
)}`;

/**
 * Photo slots. `src` is null until a real photo exists for that slot, and the
 * Photo component renders a styled placeholder instead — the site never ships a
 * broken image, and adding a picture is a one-line change here.
 *
 * Files are produced by scripts/prepare-photos.ps1, which bakes in EXIF
 * rotation and resizes for mobile.
 */
export type PhotoSlot = {
  src: string | null;
  alt: string;
  placeholder: string;
  /** CSS object-position, for landscape shots whose subject sits off-centre in a portrait frame. */
  position?: string;
};

export const SITE_PHOTOS: Record<'aboutTeam' | 'crewOnJob' | 'chairWash', PhotoSlot> = {
  aboutTeam: {
    src: '/photos/crew-on-site.jpg',
    alt: 'An OnyxHawk crew member deep-cleaning armchairs in a Nairobi office',
    placeholder: 'A photo of the crew on site in Nairobi goes here.',
  },
  crewOnJob: {
    src: '/photos/crew-floor-machine.jpg',
    alt: 'An OnyxHawk crew member in branded uniform cleaning on site in Nairobi',
    placeholder: 'Photo of a uniformed crew on site goes here.',
  },
  chairWash: {
    src: '/photos/office-chairs-wash.jpg',
    alt: 'An OnyxHawk crew member washing an office chair outdoors',
    placeholder: 'Office chairs being washed.',
    position: '80% center',
  },
};

/**
 * The hero photo cycles through these, cross-fading, with the caption changing
 * alongside it. Order matters: the first one loads eagerly as the LCP image.
 */
export const HERO_SLIDES: { slot: keyof typeof SITE_PHOTOS; caption: string }[] = [
  { slot: 'aboutTeam', caption: 'Upholstery shampoo and floor care on site' },
  { slot: 'chairWash', caption: 'Office chairs washed by hand, one at a time' },
  { slot: 'crewOnJob', caption: 'Deep clean underway in a Nairobi office' },
];

export type ServiceEntry = {
  /** Catalog code in the API, used to deep link the quote flow. */
  code: string;
  name: string;
  description: string;
  icon: 'home' | 'office' | 'medical' | 'hardhat' | 'sofa' | 'rug' | 'pest' | 'air';
  /** Accent colour for the service card; each service gets its own. */
  tone: ServiceTone;
  /** Banner photo for the card, under /public. Cards without one get a tone-coloured banner. */
  image?: string;
};

export type ServiceTone = 'emerald' | 'blue' | 'rose' | 'amber' | 'fuchsia' | 'cyan' | 'violet' | 'sky';

/** Everyday cleaning — the core lines most clients book. */
export const EVERYDAY_SERVICES: ServiceEntry[] = [
  {
    code: 'residential',
    name: 'Residential cleaning',
    description: 'Homes and apartments — regular upkeep, deep cleans, and move-in or move-out.',
    icon: 'home',
    tone: 'emerald',
    image: '/photos/services/residential.webp',
  },
  {
    code: 'office',
    name: 'Office & commercial',
    description: 'Workspaces, retail and hospitality, cleaned around your opening hours.',
    icon: 'office',
    tone: 'blue',
    image: '/photos/services/office.webp',
  },
  {
    code: 'hospital',
    name: 'Medical & hospital',
    description: 'Clinics and wards cleaned to clinical hygiene standards by certified crews.',
    icon: 'medical',
    tone: 'rose',
    image: '/photos/services/hospital.webp',
  },
  {
    code: 'post_build',
    name: 'Post-construction',
    description: 'Dust, debris and paint residue cleared so a finished site is ready to hand over.',
    icon: 'hardhat',
    tone: 'amber',
  },
];

/** Specialist work, usually added onto a clean or booked on its own. */
export const SPECIALIST_SERVICES: ServiceEntry[] = [
  {
    code: 'sofa',
    name: 'Sofa & upholstery',
    description: 'Deep extraction cleaning for sofas, armchairs and headboards.',
    icon: 'sofa',
    tone: 'fuchsia',
    image: '/photos/services/sofa.webp',
  },
  {
    code: 'carpet',
    name: 'Carpet & rugs',
    description: 'Stain treatment and hot-water extraction that lifts embedded dirt.',
    icon: 'rug',
    tone: 'cyan',
  },
  {
    code: 'fumigation',
    name: 'Fumigation & pest control',
    description: 'Safe, licensed treatment for roaches, bedbugs, termites and rodents.',
    icon: 'pest',
    tone: 'violet',
  },
  {
    code: 'ac_duct',
    name: 'AC, mattress & curtains',
    description: 'Air conditioning units, ducts, mattresses, curtains and drapes.',
    icon: 'air',
    tone: 'sky',
  },
];

export const ALL_SERVICES = [...EVERYDAY_SERVICES, ...SPECIALIST_SERVICES];

export type Step = {
  title: string;
  description: string;
  icon: 'list' | 'calendar' | 'pay' | 'sparkle' | 'star';
};

export const HOW_IT_WORKS: Step[] = [
  {
    title: 'Pick your clean',
    description: 'Choose the service and tell us the size of the space. You see the price before you commit.',
    icon: 'list',
  },
  {
    title: 'Schedule a slot',
    description: 'Pick a date and time that suits you — same-day slots are often available.',
    icon: 'calendar',
  },
  {
    title: 'Pay with M-Pesa',
    description: 'Approve the STK push on your phone. No cash changes hands, and you get a receipt.',
    icon: 'pay',
  },
  {
    title: 'We clean',
    description: 'A vetted, insured crew arrives in branded uniform with eco-friendly products.',
    icon: 'sparkle',
  },
  {
    title: 'Earn Hawk Points',
    description: 'Every clean earns points towards discounts on future bookings.',
    icon: 'star',
  },
];

export type Feature = {
  title: string;
  description: string;
  icon: 'shield' | 'badge' | 'tag' | 'leaf' | 'clock' | 'camera';
};

export const WHY_CHOOSE_US: Feature[] = [
  {
    title: 'Fully insured',
    description: 'Every job is covered, so your home or premises is never at risk.',
    icon: 'shield',
  },
  {
    title: 'Vetted crew',
    description: 'Background-checked, trained and uniformed — you know exactly who is arriving.',
    icon: 'badge',
  },
  {
    title: 'Clear pricing',
    description: 'You see the price before booking. No hidden fees, no surprises on the day.',
    icon: 'tag',
  },
  {
    title: 'Eco-friendly',
    description: 'Products that are safe around children, pets and sensitive surfaces.',
    icon: 'leaf',
  },
  {
    title: 'Same-day cleans',
    description: 'Need it today? Same-day slots are available across most of Nairobi.',
    icon: 'clock',
  },
  {
    title: 'Proof of work',
    description: 'Before-and-after photos on every visit, saved to your booking.',
    icon: 'camera',
  },
];

/** Nairobi neighbourhoods we name explicitly (also our SEO service areas). */
export const SERVICE_AREAS = [
  'Westlands',
  'Karen',
  'Kilimani',
  'Lavington',
  'Kileleshwa',
  'Runda',
] as const;

export type Segment = {
  /** Anchor id on the homepage's "who we serve" section, and the nav dropdown target. */
  slug: string;
  title: string;
  description: string;
  icon: 'home' | 'office' | 'medical' | 'hardhat' | 'buildings' | 'users';
  areas?: readonly string[];
};

export const SEGMENTS: Segment[] = [
  {
    slug: 'residential',
    title: 'Residential',
    description: 'Homes, apartments and holiday lets across Nairobi’s suburbs.',
    icon: 'home',
    areas: SERVICE_AREAS,
  },
  {
    slug: 'offices-corporate',
    title: 'Offices & corporate',
    description: 'Workspaces cleaned around your opening hours, with no disruption to the day.',
    icon: 'office',
  },
  {
    slug: 'retail-hospitality',
    title: 'Retail & hospitality',
    description: 'Shops, showrooms, gyms and hospitality spaces kept guest-ready.',
    icon: 'buildings',
  },
  {
    slug: 'medical',
    title: 'Medical',
    description: 'Clinics, dental practices, labs and hospital wards.',
    icon: 'medical',
  },
  {
    slug: 'schools-institutions',
    title: 'Schools & institutions',
    description: 'Classrooms, halls and shared facilities cleaned outside school hours.',
    icon: 'users',
  },
  {
    slug: 'developers',
    title: 'Developers',
    description: 'Post-construction handover cleans for contractors and property firms.',
    icon: 'hardhat',
  },
];

/** A published job's client type in plain words, on job cards and the portfolio filter. */
export const CLIENT_SEGMENT_LABEL: Record<ClientSegment, string> = {
  RESIDENTIAL: 'Home',
  COMMERCIAL: 'Business',
  MEDICAL: 'Clinic',
  DEVELOPER: 'Property developer',
};

export const COVERAGE_POINTS = [
  { title: 'Nationwide reach', description: 'Beyond Nairobi, we mobilise crews to sites countrywide.' },
  { title: 'Flexible scheduling', description: 'Evenings, weekends and out-of-hours to suit your operation.' },
  { title: 'Same 5-star standard', description: 'One playbook and one standard, wherever the job is.' },
] as const;

export type TeamMember = {
  role: string;
  /** Real name — leave undefined until confirmed; never invent one. */
  name?: string;
  /** Path under /public once a real photo is supplied. */
  photo?: string;
};

/**
 * Roles are public; names and photos appear as they are supplied. Cards render
 * the role alone until then rather than showing a placeholder person.
 */
export const TEAM: TeamMember[] = [
  { role: 'Chief Executive Officer', photo: '/photos/passport.jpeg' },
  { role: 'Chief Operations Officer' },
  { role: 'Marketing Manager' },
  { role: 'Graphic Designer' },
  { role: 'Ground Supervisor' },
];

export const FAQS = [
  {
    q: 'How quickly can you come?',
    a: 'Same-day slots are often available across Nairobi. Pick a date in the booking flow and you will see live availability.',
  },
  {
    q: 'How do I pay?',
    a: `Through M-Pesa. When you confirm a booking we send an STK push to your phone — approve it and you get a receipt. No cash changes hands.`,
  },
  {
    q: 'Do you bring your own products and equipment?',
    a: 'Yes. Our crews arrive with everything needed, including eco-friendly products that are safe around children and pets.',
  },
  {
    q: 'Are your cleaners vetted and insured?',
    a: 'Every crew member is background-checked, trained and uniformed, and all work is fully insured.',
  },
  {
    q: 'How do I know the work was done properly?',
    a: 'We take before-and-after photos on every visit and attach them to your booking, so you can see the result even if you were not there.',
  },
  {
    q: 'Which areas do you cover?',
    a: `We cover Nairobi including ${SERVICE_AREAS.join(', ')}, and mobilise crews countrywide for commercial and post-construction work.`,
  },
  {
    q: 'What are Hawk Points?',
    a: 'Our loyalty programme. Every clean earns points that convert into discounts on future bookings.',
  },
] as const;
