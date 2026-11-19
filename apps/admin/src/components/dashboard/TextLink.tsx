'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '../../lib/cn';

/**
 * The Dashboard's one look for a text link: navy, medium weight, a trailing
 * arrow, and an underline on hover. Every link in running text or at the edge
 * of a card uses it, whether it goes to a page (`TextLink`) or opens something
 * on this one (`TextLinkButton`).
 */
const base = 'group/link inline-flex items-center gap-1 rounded text-sm font-medium text-navy';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="underline-offset-4 group-hover/link:underline">{children}</span>
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5"
      />
    </>
  );
}

export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(base, className)}>
      <Label>{children}</Label>
    </Link>
  );
}

export function TextLinkButton({
  onClick, children, className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(base, className)}>
      <Label>{children}</Label>
    </button>
  );
}
