import Link from 'next/link';
import type { ReactNode } from 'react';

import { Section, SectionHeading } from '../layout';
import { ArrowRightIcon, BadgeCheckIcon, SparkleIcon } from '../icons';
import { Icon } from './iconMap';
import { cn } from '../../lib/cn';
import {
  EVERYDAY_SERVICES,
  SPECIALIST_SERVICES,
  type ServiceEntry,
  type ServiceTone,
} from '../../content/site';

/**
 * Per-service colour classes. Spelled out in full rather than built from the
 * tone name, because Tailwind only ships classes it can find written in source.
 */
const TONES: Record<
  ServiceTone,
  { tile: string; bar: string; text: string; border: string; watermark: string }
> = {
  emerald: {
    tile: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30',
    bar: 'from-emerald-400 to-emerald-600',
    text: 'text-emerald-700',
    border: 'hover:border-emerald-200',
    watermark: 'text-emerald-600',
  },
  blue: {
    tile: 'from-blue-500 to-blue-700 shadow-blue-500/30',
    bar: 'from-blue-400 to-blue-600',
    text: 'text-blue-700',
    border: 'hover:border-blue-200',
    watermark: 'text-blue-600',
  },
  rose: {
    tile: 'from-rose-500 to-rose-700 shadow-rose-500/30',
    bar: 'from-rose-400 to-rose-600',
    text: 'text-rose-700',
    border: 'hover:border-rose-200',
    watermark: 'text-rose-600',
  },
  amber: {
    tile: 'from-amber-500 to-amber-700 shadow-amber-500/30',
    bar: 'from-amber-400 to-amber-600',
    text: 'text-amber-700',
    border: 'hover:border-amber-200',
    watermark: 'text-amber-600',
  },
  fuchsia: {
    tile: 'from-fuchsia-500 to-fuchsia-700 shadow-fuchsia-500/30',
    bar: 'from-fuchsia-400 to-fuchsia-600',
    text: 'text-fuchsia-700',
    border: 'hover:border-fuchsia-200',
    watermark: 'text-fuchsia-600',
  },
  cyan: {
    tile: 'from-cyan-500 to-cyan-700 shadow-cyan-500/30',
    bar: 'from-cyan-400 to-cyan-600',
    text: 'text-cyan-700',
    border: 'hover:border-cyan-200',
    watermark: 'text-cyan-600',
  },
  violet: {
    tile: 'from-violet-500 to-violet-700 shadow-violet-500/30',
    bar: 'from-violet-400 to-violet-600',
    text: 'text-violet-700',
    border: 'hover:border-violet-200',
    watermark: 'text-violet-600',
  },
  sky: {
    tile: 'from-sky-500 to-sky-700 shadow-sky-500/30',
    bar: 'from-sky-400 to-sky-600',
    text: 'text-sky-700',
    border: 'hover:border-sky-200',
    watermark: 'text-sky-600',
  },
};

function ServiceCard({ service }: { service: ServiceEntry }) {
  const tone = TONES[service.tone];

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg',
        tone.border,
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', tone.bar)} />
      <Icon
        name={service.icon}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -bottom-5 -right-5 h-32 w-32 -rotate-12 opacity-[0.07] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110',
          tone.watermark,
        )}
      />

      <span
        className={cn(
          'relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
          tone.tile,
        )}
      >
        <Icon name={service.icon} className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <h3 className="relative mt-5 text-lg font-semibold text-charcoal">{service.name}</h3>
      <p className="relative mt-2 flex-1 text-sm leading-relaxed text-charcoal-muted">{service.description}</p>
      <Link
        href={`/quote?service=${service.code}`}
        className={cn('relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold', tone.text)}
      >
        Get quote
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}

function GroupHeader({
  icon,
  tile,
  title,
  description,
  count,
}: {
  icon: ReactNode;
  tile: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line pb-4">
      <span
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
          tile,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-charcoal sm:text-lg">{title}</h3>
        <p className="text-sm text-charcoal-muted">{description}</p>
      </div>
      <span className="ml-auto hidden shrink-0 rounded-pill bg-navy-soft px-3 py-1 text-xs font-semibold text-navy sm:inline-block">
        {count} services
      </span>
    </div>
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
        <GroupHeader
          icon={<SparkleIcon className="h-5 w-5" />}
          tile="from-navy to-navy-deep shadow-navy/30"
          title="Everyday cleaning"
          description="The core cleans most clients book."
          count={EVERYDAY_SERVICES.length}
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EVERYDAY_SERVICES.map((service) => (
            <ServiceCard key={service.code} service={service} />
          ))}
        </div>
      </div>

      <div className="mt-14">
        <GroupHeader
          icon={<BadgeCheckIcon className="h-5 w-5" />}
          tile="from-aqua to-aqua-deep shadow-aqua/30"
          title="Specialist add-ons"
          description="Added onto a clean, or booked on their own."
          count={SPECIALIST_SERVICES.length}
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIALIST_SERVICES.map((service) => (
            <ServiceCard key={service.code} service={service} />
          ))}
        </div>
      </div>
    </Section>
  );
}
