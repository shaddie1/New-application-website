'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '../ui/button';
import { isSameMonth, monthLabel, nextMonth, previousMonth, type YearMonth } from './month';

/**
 * Previous and next arrows around the month's name. It cannot go past the
 * current month: there is nothing recorded in a month that has not started.
 */
export function MonthSelector({
  value, current, onChange,
}: {
  value: YearMonth;
  /** The current month in Nairobi: the furthest the selector goes. */
  current: YearMonth;
  onChange: (month: YearMonth) => void;
}) {
  const atCurrent = isSameMonth(value, current);
  const before = previousMonth(value);
  const after = nextMonth(value);

  return (
    <div
      role="group"
      aria-label="Month shown"
      className="inline-flex items-center rounded-xl border border-line bg-surface p-1"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Previous month, ${monthLabel(before)}`}
        onClick={() => onChange(before)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span aria-live="polite" className="figure min-w-[9.5rem] px-1 text-center text-sm font-medium text-charcoal">
        {monthLabel(value)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={atCurrent ? 'Next month, not available yet' : `Next month, ${monthLabel(after)}`}
        disabled={atCurrent}
        onClick={() => onChange(after)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
