import type { Metadata } from 'next';
import Link from 'next/link';

import { SurfaceCard, IconChip, Section, SectionHeading } from '../../../src/components/layout';
import { ButtonLink } from '../../../src/components/ui';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  MailIcon,
  PhoneIcon,
  PhonePayIcon,
  PinIcon,
  WhatsAppIcon,
} from '../../../src/components/icons';
import { COMPANY, SERVICE_AREAS, WHATSAPP_LINK } from '../../../src/content/site';

export const metadata: Metadata = {
  title: 'Contact OnyxHawk — get a free cleaning quote in Nairobi',
  description: `Call ${COMPANY.phoneDisplay}, message us on WhatsApp, or request a free quote online. OnyxHawk Cleaning Service covers ${SERVICE_AREAS.join(', ')} and the rest of Nairobi, with countrywide contracts available.`,
  alternates: { canonical: '/contact' },
};

const CHANNELS = [
  {
    icon: WhatsAppIcon,
    label: 'WhatsApp',
    value: 'Chat with us now',
    href: WHATSAPP_LINK,
    external: true,
    note: 'Fastest response during working hours',
  },
  {
    icon: PhoneIcon,
    label: 'Phone',
    value: COMPANY.phoneDisplay,
    href: `tel:${COMPANY.phoneE164}`,
    external: false,
    note: COMPANY.hours,
  },
  {
    icon: MailIcon,
    label: 'Email',
    value: COMPANY.email,
    href: `mailto:${COMPANY.email}`,
    external: false,
    note: 'For quotes, contracts and invoices',
  },
];

const QUOTE_INCLUDES = [
  'A fixed price before any work begins',
  'A crew matched to the size of your space',
  'Same-day slots where available',
  'Before-and-after photos on completion',
];

export default function ContactPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Contact"
          title="Ready for a spotless space?"
          lead="Get your free quote today — booked in minutes, paid by M-Pesa, with proof on every visit. Reach us whichever way suits you."
        />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* Channels */}
          <div className="space-y-4">
            {CHANNELS.map((channel) => (
              <a
                key={channel.label}
                href={channel.href}
                {...(channel.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="flex items-start gap-4 rounded-xl border border-line bg-white p-5 transition-colors hover:border-gold-bright/55 hover:bg-cream-deep"
              >
                <IconChip>
                  <channel.icon />
                </IconChip>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-charcoal-muted">
                    {channel.label}
                  </p>
                  <p className="mt-1 truncate text-base font-medium text-charcoal">{channel.value}</p>
                  <p className="mt-0.5 text-sm text-charcoal-muted">{channel.note}</p>
                </div>
              </a>
            ))}

            <SurfaceCard>
              <div className="flex items-start gap-4">
                <IconChip>
                  <PinIcon />
                </IconChip>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-charcoal-muted">Visit us</p>
                  <p className="mt-1 text-base text-charcoal">{COMPANY.addressLine}</p>
                  <p className="text-sm text-charcoal-muted">{COMPANY.city}</p>
                  <p className="mt-1 text-sm text-charcoal-muted">{COMPANY.postal}</p>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-start gap-4">
                <IconChip>
                  <ClockIcon />
                </IconChip>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-charcoal-muted">Hours</p>
                  <p className="mt-1 text-base text-charcoal">{COMPANY.hours}</p>
                  <p className="mt-0.5 text-sm text-charcoal-muted">
                    Out-of-hours and weekend cleans available on request.
                  </p>
                </div>
              </div>
            </SurfaceCard>
          </div>

          {/* Booking panel */}
          <div className="rounded-xl border border-gold-bright/40 bg-gradient-to-br from-gold-bright/[0.14] via-white to-white p-8">
            <h2 className="text-2xl font-bold tracking-tight text-charcoal">Request a free quote</h2>
            <p className="mt-3 text-sm leading-relaxed text-charcoal-muted">
              Tell us the service, the size of the space and when you need it. We come back with a fixed price — no
              obligation, no hidden fees.
            </p>

            <ul className="mt-6 space-y-3">
              {QUOTE_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-charcoal-muted">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-bronze" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/quote" size="lg">
                Get a free quote
              </ButtonLink>
              <ButtonLink
                href="/book"
                size="lg"
                variant="secondary"
                className="border-gold-bright/45 bg-transparent text-charcoal hover:bg-gold-bright/15"
              >
                Book online
              </ButtonLink>
            </div>

            <div className="mt-8 flex items-start gap-3 border-t border-line pt-6">
              <PhonePayIcon className="mt-0.5 h-5 w-5 shrink-0 text-bronze" />
              <p className="text-sm text-charcoal-muted">
                <span className="font-medium text-charcoal">Pay by M-Pesa.</span> Approve the STK push on your
                phone when you book — no cash on site, and an instant receipt.
              </p>
            </div>

            <Link
              href="/services"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-bronze transition-colors hover:text-charcoal"
            >
              Browse all services
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Section>

      <Section tone="raised" className="py-14">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-charcoal-muted">Areas we cover</h2>
        <ul className="mt-5 flex flex-wrap gap-2.5">
          {SERVICE_AREAS.map((area) => (
            <li
              key={area}
              className="rounded-pill border border-line bg-cream px-4 py-2 text-sm text-charcoal-muted"
            >
              {area}
            </li>
          ))}
          <li className="rounded-pill border border-gold-bright/45 bg-gold-bright/15 px-4 py-2 text-sm text-bronze">
            …and countrywide
          </li>
        </ul>
      </Section>
    </>
  );
}
