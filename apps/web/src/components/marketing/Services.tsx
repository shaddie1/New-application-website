import Link from 'next/link';

import { DarkCard, IconChip, Section, SectionHeading } from '../layout';
import { ArrowRightIcon } from '../icons';
import { Icon } from './iconMap';
import { EVERYDAY_SERVICES, SPECIALIST_SERVICES, type ServiceEntry } from '../../content/site';

function ServiceCard({ service }: { service: ServiceEntry }) {
  return (
    <DarkCard interactive className="flex flex-col">
      <IconChip>
        <Icon name={service.icon} />
      </IconChip>
      <h3 className="mt-4 text-lg font-semibold text-text-on-dark">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-text-on-dark-muted">{service.description}</p>
      <Link
        href={`/quote?service=${service.code}`}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-gold transition-colors hover:text-gold-soft"
      >
        Get quote
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </DarkCard>
  );
}

export function ServicesSection({ heading = true }: { heading?: boolean }) {
  return (
    <Section id="services">
      {heading ? (
        <SectionHeading
          eyebrow="What we clean"
          title="Every space, one standard"
          lead="From a weekly home clean to a hospital ward or a post-handover site — the same vetted crews and the same finish."
        />
      ) : null}

      <div className="mt-12">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-on-dark-muted">Everyday cleaning</h3>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EVERYDAY_SERVICES.map((service) => (
            <ServiceCard key={service.code} service={service} />
          ))}
        </div>
      </div>

      <div className="mt-14">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-on-dark-muted">
          Specialist add-ons
        </h3>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIALIST_SERVICES.map((service) => (
            <ServiceCard key={service.code} service={service} />
          ))}
        </div>
      </div>
    </Section>
  );
}
