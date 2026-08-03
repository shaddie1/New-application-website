import type { Metadata } from 'next';

import { SurfaceCard, IconChip, Section, SectionHeading } from '../../../src/components/layout';
import { SparkleIcon, StarIcon, ShieldIcon } from '../../../src/components/icons';
import { Team } from '../../../src/components/marketing/Team';
import { TrustBar } from '../../../src/components/marketing/Hero';
import { WhyChooseUs } from '../../../src/components/marketing/WhyChooseUs';
import { FinalCta } from '../../../src/components/marketing/FinalCta';
import { COMPANY } from '../../../src/content/site';

export const metadata: Metadata = {
  title: 'About OnyxHawk — our story',
  description: `Founded in Nairobi in ${COMPANY.foundedYear}, OnyxHawk Cleaning Service delivers professional cleaning for homes, offices, medical facilities and post-construction sites, with vetted insured crews, eco-friendly products and photo proof on every visit.`,
  alternates: { canonical: '/about' },
};

const PILLARS = [
  {
    icon: SparkleIcon,
    title: 'Our mission',
    text: 'To make professional cleaning effortless to book and impossible to doubt — a fair price up front, and evidence of the work when it is done.',
  },
  {
    icon: StarIcon,
    title: 'Our vision',
    text: 'To be the cleaning company Kenyan homes and businesses recommend by name, known for a standard that does not vary by client, site or day.',
  },
  {
    icon: ShieldIcon,
    title: 'Our promise',
    text: 'Vetted, insured crews. Eco-friendly products. Clear pricing with no hidden fees. If something is not right, we come back and fix it.',
  },
];

export default function AboutPage() {
  return (
    <>
      <Section className="pb-8">
        <SectionHeading
          eyebrow={`Nairobi · Est. ${COMPANY.foundedYear}`}
          title="We built the cleaning company we wanted to hire"
          lead="OnyxHawk began with one crew, one van and a conviction that cleaning could be run like a modern service business rather than a phone-and-cash arrangement."
        />
      </Section>

      <TrustBar />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="space-y-5 text-base leading-relaxed text-charcoal-muted">
            <p>
              We started in {COMPANY.foundedYear} in Nairobi, cleaning homes for clients who were tired of the same
              three problems: you could never get a straight answer on price, you never quite knew who was coming to
              your door, and once the crew left there was no record of what had actually been done.
            </p>
            <p>
              So we built the company around fixing exactly those things. Every crew member is background-checked,
              trained and insured, and arrives in branded uniform. Every quote shows the price before you commit.
              Every payment runs through M-Pesa, so there is no cash on site and you always get a receipt. And every
              visit ends with before-and-after photos saved to your booking — proof you can look at even if you were
              not there.
            </p>
            <p>
              Six years on, that approach has taken us from single homes to offices, clinics, hospital wings and
              post-construction handovers, in Nairobi and on contracts countrywide. The equipment has grown. The
              standard has not moved.
            </p>
            <p className="text-charcoal">
              We also invested in the boring things that make a service reliable: our own booking platform, a loyalty
              programme that rewards repeat clients, and scheduling that can put a crew on site the same day.
            </p>
          </div>

          {/* Image slot — a real crew or premises photo belongs here. */}
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-line bg-gradient-to-br from-white via-cream-deep to-white lg:aspect-auto">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-bronze/70">Our team at work</span>
              <p className="max-w-[18rem] text-sm text-charcoal-muted">
                A photo of the crew on site in Nairobi goes here.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHeading
          eyebrow="What guides us"
          title="Mission, vision, promise"
          align="center"
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PILLARS.map((pillar) => (
            <SurfaceCard key={pillar.title} className="bg-cream">
              <IconChip>
                <pillar.icon />
              </IconChip>
              <h3 className="mt-4 text-lg font-semibold text-charcoal">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-muted">{pillar.text}</p>
            </SurfaceCard>
          ))}
        </div>
      </Section>

      <WhyChooseUs />
      <Team />
      <FinalCta />
    </>
  );
}
