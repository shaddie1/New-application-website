import type { Metadata } from 'next';
import Link from 'next/link';

import { SurfaceCard, IconChip, Section, SectionHeading } from '../../src/components/layout';
import { ArrowRightIcon, BadgeCheckIcon, CameraIcon, LeafIcon, PhonePayIcon } from '../../src/components/icons';
import { Hero } from '../../src/components/marketing/Hero';
import { ServicesSection } from '../../src/components/marketing/Services';
import { HowItWorks } from '../../src/components/marketing/HowItWorks';
import { WhyChooseUs } from '../../src/components/marketing/WhyChooseUs';
import { WhoWeServe } from '../../src/components/marketing/WhoWeServe';
import { Team } from '../../src/components/marketing/Team';
import { Faq } from '../../src/components/marketing/Faq';
import { FinalCta } from '../../src/components/marketing/FinalCta';
import { localBusinessJsonLd, faqJsonLd } from '../../src/lib/jsonLd';
import { COMPANY, SERVICE_AREAS } from '../../src/content/site';

export const metadata: Metadata = {
  // `absolute` opts out of the layout's "%s · OnyxHawk" template, which would
  // otherwise repeat the brand name twice in the homepage title.
  title: { absolute: 'OnyxHawk — Professional cleaning in Nairobi, booked in minutes' },
  description: `Premium cleaning for homes, offices, clinics and post-construction sites across Nairobi — ${SERVICE_AREAS.join(', ')} and countrywide. Vetted insured crews, eco-friendly products, M-Pesa payment and photo proof on every visit.`,
  alternates: { canonical: '/' },
};

const DIFFERENTIATORS = [
  { icon: LeafIcon, title: 'Eco-friendly products', text: 'Safe around children, pets and delicate surfaces.' },
  { icon: BadgeCheckIcon, title: 'Vetted & insured crews', text: 'Background-checked, trained and uniformed.' },
  { icon: CameraIcon, title: 'Proof on every visit', text: 'Before-and-after photos attached to your booking.' },
  { icon: PhonePayIcon, title: 'M-Pesa, no cash', text: 'Approve an STK push and get an instant receipt.' },
];

export default function HomePage() {
  return (
    <>
      {/* Structured data, so the business surfaces correctly in local search. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

      <Hero />

      {/* About teaser */}
      <Section tone="gold">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow={`Since ${COMPANY.foundedYear}`}
              title="A Nairobi cleaning company built on proof, not promises"
              lead={`We started in ${COMPANY.foundedYear} with a simple frustration: cleaning companies that were hard to book, vague on price and impossible to hold to a standard. OnyxHawk fixes all three — a clear price before you commit, M-Pesa payment with a receipt, and photo evidence of every job.`}
            />
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-bronze transition-colors hover:text-charcoal"
            >
              Read our story
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {DIFFERENTIATORS.map((item) => (
              <SurfaceCard key={item.title}>
                <IconChip>
                  <item.icon />
                </IconChip>
                <h3 className="mt-4 text-base font-semibold text-charcoal">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-charcoal-muted">{item.text}</p>
              </SurfaceCard>
            ))}
          </div>
        </div>
      </Section>

      <ServicesSection />
      <HowItWorks />
      <WhyChooseUs />
      <WhoWeServe />
      <Team />
      <Faq />
      <FinalCta />
    </>
  );
}
