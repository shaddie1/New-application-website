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
  {
    tile: string;
    bar: string;
    text: string;
    border: string;
    watermark: string;
    /** Colour wash over the banner photo, darkest at the bottom edge. */
    veil: string;
    /** Banner fill for cards without a photo. */
    banner: string;
  }
> = {
  emerald: {
    tile: 'from-emerald-500 to-emerald-700 shadow-emerald-500/30',
    bar: 'from-emerald-400 to-emerald-600',
    text: 'text-emerald-700',
    border: 'hover:border-emerald-200',
    watermark: 'text-emerald-600',
    veil: 'from-emerald-950/50 via-emerald-900/10',
    banner: 'from-emerald-400 via-emerald-500 to-emerald-700',
  },
  blue: {
    tile: 'from-blue-500 to-blue-700 shadow-blue-500/30',
    bar: 'from-blue-400 to-blue-600',
    text: 'text-blue-700',
    border: 'hover:border-blue-200',
    watermark: 'text-blue-600',
    veil: 'from-blue-950/50 via-blue-900/10',
    banner: 'from-blue-400 via-blue-500 to-blue-700',
  },
  rose: {
    tile: 'from-rose-500 to-rose-700 shadow-rose-500/30',
    bar: 'from-rose-400 to-rose-600',
    text: 'text-rose-700',
    border: 'hover:border-rose-200',
    watermark: 'text-rose-600',
    veil: 'from-rose-950/50 via-rose-900/10',
    banner: 'from-rose-400 via-rose-500 to-rose-700',
  },
  amber: {
    tile: 'from-amber-500 to-amber-700 shadow-amber-500/30',
    bar: 'from-amber-400 to-amber-600',
    text: 'text-amber-700',
    border: 'hover:border-amber-200',
    watermark: 'text-amber-600',
    veil: 'from-amber-950/50 via-amber-900/10',
    banner: 'from-amber-400 via-amber-500 to-amber-700',
  },
  fuchsia: {
    tile: 'from-fuchsia-500 to-fuchsia-700 shadow-fuchsia-500/30',
    bar: 'from-fuchsia-400 to-fuchsia-600',
    text: 'text-fuchsia-700',
    border: 'hover:border-fuchsia-200',
    watermark: 'text-fuchsia-600',
    veil: 'from-fuchsia-950/50 via-fuchsia-900/10',
    banner: 'from-fuchsia-400 via-fuchsia-500 to-fuchsia-700',
  },
  cyan: {
    tile: 'from-cyan-500 to-cyan-700 shadow-cyan-500/30',
    bar: 'from-cyan-400 to-cyan-600',
    text: 'text-cyan-700',
    border: 'hover:border-cyan-200',
    watermark: 'text-cyan-600',
    veil: 'from-cyan-950/50 via-cyan-900/10',
    banner: 'from-cyan-400 via-cyan-500 to-cyan-700',
  },
  violet: {
    tile: 'from-violet-500 to-violet-700 shadow-violet-500/30',
    bar: 'from-violet-400 to-violet-600',
    text: 'text-violet-700',
    border: 'hover:border-violet-200',
    watermark: 'text-violet-600',
    veil: 'from-violet-950/50 via-violet-900/10',
    banner: 'from-violet-400 via-violet-500 to-violet-700',
  },
  sky: {
    tile: 'from-sky-500 to-sky-700 shadow-sky-500/30',
    bar: 'from-sky-400 to-sky-600',
    text: 'text-sky-700',
    border: 'hover:border-sky-200',
    watermark: 'text-sky-600',
    veil: 'from-sky-950/50 via-sky-900/10',
    banner: 'from-sky-400 via-sky-500 to-sky-700',
  },
};

function ServiceCard({ service }: { service: ServiceEntry }) {
  const tone = TONES[service.tone];

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl',
        tone.border,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {service.image ? (
          <img
            src={service.image}
            alt={service.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br', tone.banner)}>
            <span
              aria-hidden="true"
              className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:14px_14px]"
            />
            <Icon
              name={service.icon}
              aria-hidden="true"
              className="relative h-20 w-20 text-white/90 drop-shadow-lg transition-transform duration-700 ease-out group-hover:rotate-6 group-hover:scale-110"
              strokeWidth={1.4}
            />
          </div>
        )}
        <span aria-hidden="true" className={cn('absolute inset-0 bg-gradient-to-t to-transparent', tone.veil)} />
        {/* Light sweep across the banner on hover. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all duration-700 ease-out group-hover:left-[150%]"
        />
        <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', tone.bar)} />
      </div>

      <div className="relative flex flex-1 flex-col px-6 pb-6">
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
            'relative -mt-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-4 ring-white transition-transform duration-300 group-hover:-translate-y-1',
            tone.tile,
          )}
        >
          <Icon name={service.icon} className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <h3 className="relative mt-4 text-lg font-semibold text-charcoal">{service.name}</h3>
        <p className="relative mt-2 flex-1 text-sm leading-relaxed text-charcoal-muted">{service.description}</p>
        <Link
          href={`/quote?service=${service.code}`}
          className={cn('relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold', tone.text)}
        >
          Get quote
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
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
