import type { Metadata } from 'next';

import { Section, SectionHeading } from '../../../src/components/layout';
import { FinalCta } from '../../../src/components/marketing/FinalCta';
import { PortfolioGallery } from '../../../src/components/marketing/PortfolioGallery';
import { getPublishedJobs } from '../../../src/lib/websiteJobs';

export const metadata: Metadata = {
  title: 'Our work — real cleans across Nairobi',
  description:
    'Photos from real OnyxHawk jobs — residential, office and upholstery cleans across Nairobi, documented before and after.',
  alternates: { canonical: '/portfolio' },
};

export default async function PortfolioPage() {
  const jobs = await getPublishedJobs();

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
        <PortfolioGallery jobs={jobs} />
      </Section>

      <FinalCta />
    </>
  );
}
