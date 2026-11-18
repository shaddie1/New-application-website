'use client';

import { cn } from '../../lib/cn';

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * A choice of one from a few, drawn as joined segments. Underneath it is a
 * native radio group, so the arrow keys move the choice, Tab enters and
 * leaves it once, and a screen reader announces it as a group:
 *
 *   <Segmented
 *     legend="Figures shown"
 *     name="ownership-scope"
 *     options={[{ value: 'all-time', label: 'All time' }, { value: 'this-month', label: 'This month' }]}
 *     value={scope}
 *     onChange={setScope}
 *   />
 */
export function Segmented<T extends string>({
  legend, name, options, value, onChange, className,
}: {
  /** Names the group for screen readers. Not shown. */
  legend: string;
  /** The radio group's name. It must be unique on the page. */
  name: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-charcoal-muted transition-colors hover:bg-mist peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-aqua/60 peer-focus-visible:ring-offset-2">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
