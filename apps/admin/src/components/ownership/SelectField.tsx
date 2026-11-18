import { ChevronDown } from 'lucide-react';

import { cn } from '../../lib/cn';

/**
 * A select drawn like the forms' text fields: the same height, border and
 * inset, with one chevron in place of the browser's own arrow, which differs
 * from one browser to the next.
 */
export function SelectField({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={cn('w-full appearance-none rounded-lg border border-border bg-bg py-2 pl-3 pr-9 text-sm', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-charcoal-muted" />
    </span>
  );
}
