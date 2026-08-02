/**
 * Marketing copy for the public site, in one place.
 *
 * Service entries carry the catalog `code` from the API so the cards can deep
 * link into the booking/quote flow — and so the marketing names stay tied to
 * the real catalog rather than drifting from it.
 */

export const COMPANY = {
  name: 'OnyxHawk Cleaning Service',
  shortName: 'OnyxHawk',
  foundedYear: 2019,
  tagline: 'Professional cleaning, booked in minutes.',
  phoneDisplay: '+254 115 247 988',
  phoneE164: '+254115247988',
  whatsAppNumber: '254115247988',
  email: 'info@onyxhawkcleaningservice.com',
  addressLine: 'Hodamatt Building, Base Road, Roysambu',
  city: 'Nairobi, Kenya',
  postal: 'P.O. Box 73492 – 00200, Nairobi',
  hours: 'Mon–Sat, 7:00am – 7:00pm',
} as const;

export const WHATSAPP_LINK = `https://wa.me/${COMPANY.whatsAppNumber}?text=${encodeURIComponent(
  "Hi OnyxHawk, I'd like a cleaning quote.",
)}`;

/** Headline proof points. Shown as the trust bar under the hero. */
export const TRUST_STATS = [
  { value: '6+', label: 'Years in business' },
  { value: '4.9★', label: 'Average rating' },
  { value: '500+', label: 'Clients served' },
  { value: '2,000+', label: 'Cleans completed' },
] as const;

export type ServiceEntry = {
  /** Catalog code in the API, used to deep link the quote flow. */
  code: string;
  name: string;
  description: string;
  icon: 'home' | 'office' | 'medical' | 'hardhat' | 'sofa' | 'rug' | 'pest' | 'air';
};

/** Everyday cleaning — the core lines most clients book. */
export const EVERYDAY_SERVICES: ServiceEntry[] = [
  {
    code: 'residential',
    name: 'Residential cleaning',
    description: 'Homes and apartments — regular upkeep, deep cleans, and move-in or move-out.',
    icon: 'home',
  },
  {
    code: 'office',
    name: 'Office & commercial',
    description: 'Workspaces, retail and hospitality, cleaned around your opening hours.',
    icon: 'office',
  },
  {
    code: 'hospital',
    name: 'Medical & hospital',
    description: 'Clinics and wards cleaned to clinical hygiene standards by certified crews.',
    icon: 'medical',
  },
  {
    code: 'post_build',
    name: 'Post-construction',
    description: 'Dust, debris and paint residue cleared so a finished site is ready to hand over.',
    icon: 'hardhat',
  },
];

/** Specialist work, usually added onto a clean or booked on its own. */
export const SPECIALIST_SERVICES: ServiceEntry[] = [
  {
    code: 'sofa',
    name: 'Sofa & upholstery',
    description: 'Deep extraction cleaning for sofas, armchairs and headboards.',
    icon: 'sofa',
  },
  {
    code: 'carpet',
    name: 'Carpet & rugs',
    description: 'Stain treatment and hot-water extraction that lifts embedded dirt.',
    icon: 'rug',
  },
  {
    code: 'fumigation',
    name: 'Fumigation & pest control',
    description: 'Safe, licensed treatment for roaches, bedbugs, termites and rodents.',
    icon: 'pest',
  },
  {
    code: 'ac_duct',
    name: 'AC, mattress & curtains',
    description: 'Air conditioning units, ducts, mattresses, curtains and drapes.',
    icon: 'air',
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
  title: string;
  description: string;
  icon: 'home' | 'office' | 'medical' | 'hardhat';
  areas?: readonly string[];
};

export const SEGMENTS: Segment[] = [
  {
    title: 'Residential',
    description: 'Homes, apartments and holiday lets across Nairobi’s suburbs.',
    icon: 'home',
    areas: SERVICE_AREAS,
  },
  {
    title: 'Commercial',
    description: 'Offices, retail units, gyms, schools and places of worship.',
    icon: 'office',
  },
  {
    title: 'Medical',
    description: 'Clinics, dental practices, labs and hospital wards.',
    icon: 'medical',
  },
  {
    title: 'Developers',
    description: 'Post-construction handover cleans for contractors and property firms.',
    icon: 'hardhat',
  },
];

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
  { role: 'Chief Executive Officer' },
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
