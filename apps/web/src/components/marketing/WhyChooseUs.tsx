import { DarkCard, IconChip, Section, SectionHeading } from '../layout';
import { Icon } from './iconMap';
import { WHY_CHOOSE_US } from '../../content/site';

export function WhyChooseUs() {
  return (
    <Section id="why-us">
      <SectionHeading
        eyebrow="Why OnyxHawk"
        title="The details that decide who you let into your space"
        lead="Cleaning is a trust business. These are the commitments we hold ourselves to on every single job."
      />

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {WHY_CHOOSE_US.map((feature) => (
          <DarkCard key={feature.title} interactive className="flex gap-4">
            <IconChip>
              <Icon name={feature.icon} />
            </IconChip>
            <div>
              <h3 className="text-base font-semibold text-text-on-dark">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-on-dark-muted">{feature.description}</p>
            </div>
          </DarkCard>
        ))}
      </div>
    </Section>
  );
}
