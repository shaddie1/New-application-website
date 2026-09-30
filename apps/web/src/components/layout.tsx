import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/** Page-width wrapper. Every marketing section sits inside one. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6', className)}>{children}</div>;
}

/**
 * A vertical band of the page. `tone` picks the background:
 * - `base`   the white page
 * - `raised` a cool mist band, to separate adjacent sections
 * - `fresh`  an aqua-tinted band for moments that should feel like a highlight
 */
export function Section({
  id,
  tone = 'base',
  className,
  children,
}: {
  id?: string;
  tone?: 'base' | 'raised' | 'fresh';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    base: '',
    raised: 'bg-mist',
    fresh: 'bg-gradient-to-b from-aqua-soft/70 via-mist to-white',
  } as const;

  return (
    <section id={id} className={cn('py-16 sm:py-20 lg:py-24', tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Eyebrow + headline + optional lead paragraph, used at the top of a section. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <header className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-aqua-deep">{eyebrow}</p>
      ) : null}
      <h2 className="text-3xl font-bold leading-[1.1] tracking-tight text-charcoal sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-base leading-relaxed text-charcoal-muted sm:text-lg">{lead}</p> : null}
    </header>
  );
}

/** White card sitting on the page or a mist band. */
export function SurfaceCard({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-white p-6 shadow-sm',
        interactive && 'transition hover:-translate-y-0.5 hover:border-aqua/50 hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Aqua-tinted circle holding a line icon — the visual anchor of every card. */
export function IconChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-aqua-soft text-aqua-deep',
        className,
      )}
    >
      {children}
    </span>
  );
}
