import type { Metadata } from 'next';

import { Section, SectionHeading } from '../../../src/components/layout';
import { Photo } from '../../../src/components/Photo';
import { FinalCta } from '../../../src/components/marketing/FinalCta';
import { SITE_PHOTOS } from '../../../src/content/site';

export const metadata: Metadata = {
  title: 'Our work — real cleans across Nairobi',
  description:
    'Photos from real OnyxHawk jobs — residential, office and upholstery cleans across Nairobi, documented before and after.',
  alternates: { canonical: '/portfolio' },
};

const GALLERY: { slot: keyof typeof SITE_PHOTOS; caption: string }[] = [
  { slot: 'hero', caption: 'The OnyxHawk crew, branded and ready for the day.' },
  { slot: 'crewOnJob', caption: 'On site in Nairobi — fumigation equipment set up and ready to go.' },
  { slot: 'aboutTeam', caption: 'A crew member deep-cleaning armchairs in a Nairobi office.' },
  { slot: 'upholstery', caption: 'Upholstery deep clean in progress — foam treatment worked into the fabric.' },
  { slot: 'detail', caption: 'Protective gloves, eco-friendly products, and attention to every seam.' },
  { slot: 'proofResult', caption: 'The finished armchair, back in place and ready to use.' },
];

export default function PortfolioPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Portfolio"
          title="Real crews, real jobs, real results"
          lead="Every visit is documented with before-and-after photos saved to your booking. This is a running record of actual OnyxHawk work — not stock photography."
        />
      </Section>

      <Section tone="raised">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GALLERY.map((item) => (
            <figure key={item.slot}>
              <Photo slot={SITE_PHOTOS[item.slot]} className="aspect-[4/5]" />
              <figcaption className="mt-3 text-sm text-charcoal-muted">{item.caption}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <FinalCta />
    </>
  );
}
