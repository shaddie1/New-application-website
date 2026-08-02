import type { Metadata } from 'next';

import { Section, SectionHeading } from '../../../src/components/layout';
import { HowItWorks } from '../../../src/components/marketing/HowItWorks';
import { WhyChooseUs } from '../../../src/components/marketing/WhyChooseUs';
import { Faq } from '../../../src/components/marketing/Faq';
import { FinalCta } from '../../../src/components/marketing/FinalCta';

export const metadata: Metadata = {
  title: 'How it works — book a cleaner in Nairobi in minutes',
  description:
    'Pick your clean, schedule a slot, pay with M-Pesa, and earn Hawk Points. See exactly how booking a vetted OnyxHawk crew works, from quote to before-and-after photos.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="The process"
          title={'From “I need a cleaner” to a spotless space'}
          lead="No phone tag, no haggling, no cash. Here is the whole journey — most clients are booked in under five minutes."
        />
      </Section>

      <HowItWorks />
      <WhyChooseUs />
      <Faq />
      <FinalCta />
    </>
  );
}
