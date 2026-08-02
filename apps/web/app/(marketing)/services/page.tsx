import type { Metadata } from 'next';

import { Section, SectionHeading } from '../../../src/components/layout';
import { ServicesSection } from '../../../src/components/marketing/Services';
import { HowItWorks } from '../../../src/components/marketing/HowItWorks';
import { WhoWeServe } from '../../../src/components/marketing/WhoWeServe';
import { FinalCta } from '../../../src/components/marketing/FinalCta';
import { ALL_SERVICES, SERVICE_AREAS } from '../../../src/content/site';

/**
 * A server component so the page ships real metadata — the previous version was
 * client-only and fetched the catalog on mount, which left search engines with
 * an empty page and the site's default title.
 */
export const metadata: Metadata = {
  title: 'Cleaning services in Nairobi — homes, offices, medical & post-construction',
  description: `${ALL_SERVICES.map((s) => s.name).join(', ')}. Professional cleaning across Nairobi (${SERVICE_AREAS.join(', ')}) and countrywide, with vetted insured crews and M-Pesa payment.`,
  alternates: { canonical: '/services' },
};

export default function ServicesPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Services"
          title="Cleaning for every kind of space"
          lead="Everyday cleaning for homes and workplaces, plus specialist treatments for what a regular clean cannot reach. Every job is quoted up front and paid by M-Pesa."
        />
      </Section>

      <ServicesSection heading={false} />
      <HowItWorks />
      <WhoWeServe />
      <FinalCta />
    </>
  );
}
