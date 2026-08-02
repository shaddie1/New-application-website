import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/** Page-width wrapper. Every marketing section sits inside one. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6', className)}>{children}</div>;
}

/**
 * A vertical band of the page. `tone` picks the background:
 * - `base`   the page's own charcoal
 * - `raised` a subtly lighter charcoal, to separate adjacent sections
 * - `gold`   a warm tinted band for moments that should feel like a highlight
 */
export function Section({
  id,
  tone = 'base',
  className,
  children,
}: {
  id?: string;
  tone?: 'base' | 'raised' | 'gold';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    base: '',
    raised: 'bg-ink-raised',
    gold: 'bg-gradient-to-b from-gold/[0.07] to-transparent',
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
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      ) : null}
      <h2 className="text-3xl font-bold leading-[1.1] tracking-tight text-text-on-dark sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-base leading-relaxed text-text-on-dark-muted sm:text-lg">{lead}</p> : null}
    </header>
  );
}

/** Card surface for dark sections. */
export function DarkCard({
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
        'rounded-xl border border-ink-border bg-ink-raised p-6 shadow-sm',
        interactive && 'transition-colors hover:border-gold/40 hover:bg-ink-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Gold-tinted circle holding a line icon — the visual anchor of every card. */
export function IconChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-gold/10 text-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}
