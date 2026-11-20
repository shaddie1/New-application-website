'use client';

import { useEffect, useState } from 'react';
import type { SchedulePreviewDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import {
  WEEKDAYS,
  WEEKDAY_SET,
  WEEKEND_SET,
  WEEK_OF_MONTH,
  sameDays,
  scheduleInput,
  toggleDay,
  visitDateLabel,
  type ScheduleForm,
} from '../../lib/projectSchedule';

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const label = 'mb-1 block text-xs text-charcoal-muted';

/**
 * The repeating schedule: how often, on which days, which week of the month for
 * a monthly service, and an optional deep clean with its price. Underneath, the
 * server's reading of it: a one-line summary and the next visits, or what is
 * still missing.
 */
export function ScheduleFields({
  value, onChange, startDate, endDate,
}: {
  value: ScheduleForm;
  onChange: (next: ScheduleForm) => void;
  startDate: string;
  endDate: string;
}) {
  const set = (patch: Partial<ScheduleForm>) => onChange({ ...value, ...patch });
  const preview = useSchedulePreview(value, startDate, endDate);

  const shortcut = (name: string, days: number[]) => {
    const on = sameDays(value.serviceDays, days);
    return (
      <button
        type="button"
        onClick={() => set({ serviceDays: on ? [] : days })}
        aria-pressed={on}
        className={`rounded-lg px-3 py-1.5 text-xs ${on ? 'bg-aqua-deep text-white' : 'border border-line text-charcoal-muted hover:bg-mist'}`}
      >
        {name}
      </button>
    );
  };

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-mist/60 p-4 sm:grid-cols-3">
      <div>
        <span className={label}>Repeats every</span>
        <div className="flex gap-2">
          <input
            type="number" min="1" max={value.repeatUnit === 'WEEK' ? 52 : 12} className={`${input} w-20`}
            aria-label="How many" value={value.repeatEvery}
            onChange={(e) => set({ repeatEvery: e.target.value })}
          />
          <select
            className={input} aria-label="Weeks or months" value={value.repeatUnit}
            onChange={(e) => set({ repeatUnit: e.target.value as ScheduleForm['repeatUnit'] })}
          >
            <option value="WEEK">{value.repeatEvery === '1' ? 'week' : 'weeks'}</option>
            <option value="MONTH">{value.repeatEvery === '1' ? 'month' : 'months'}</option>
          </select>
        </div>
      </div>

      {value.repeatUnit === 'MONTH' && (
        <div>
          <label className={label} htmlFor="week-of-month">Which week of the month</label>
          <select id="week-of-month" className={input} value={value.weekOfMonth} onChange={(e) => set({ weekOfMonth: e.target.value })}>
            {WEEK_OF_MONTH.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
      )}

      <fieldset className="sm:col-span-3">
        <legend className={label}>Service days</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = value.serviceDays.includes(d.day);
            return (
              <button
                key={d.day} type="button" aria-pressed={on} aria-label={d.name}
                onClick={() => set({ serviceDays: toggleDay(value.serviceDays, d.day) })}
                className={`w-12 rounded-lg py-1.5 text-xs ${on ? 'bg-navy text-white' : 'border border-line bg-white text-charcoal-muted hover:bg-mist'}`}
              >
                {d.short}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          {shortcut('Weekdays', WEEKDAY_SET)}
          {shortcut('Weekends', WEEKEND_SET)}
        </div>
      </fieldset>

      <div className="sm:col-span-3">
        <label className="flex items-center gap-2 text-sm text-charcoal">
          <input type="checkbox" checked={value.hasDeepClean} onChange={(e) => set({ hasDeepClean: e.target.checked })} />
          Includes a deep clean every few months, at its own price
        </label>
      </div>

      {value.hasDeepClean && (
        <>
          <div>
            <label className={label} htmlFor="deep-every">Deep clean every (months)</label>
            <input id="deep-every" type="number" min="1" max="24" className={input} value={value.deepCleanEveryMonths}
              onChange={(e) => set({ deepCleanEveryMonths: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="deep-price">Deep clean price (KSh)</label>
            <input id="deep-price" type="number" min="0" className={input} value={value.deepCleanPriceKes}
              onChange={(e) => set({ deepCleanPriceKes: e.target.value })} />
          </div>
        </>
      )}

      <div className="text-xs sm:col-span-3" aria-live="polite">
        {preview === null ? null : preview.problem ? (
          <p className="text-warning">{preview.problem}</p>
        ) : (
          <>
            <p className="font-medium text-charcoal">{preview.summary}</p>
            {preview.nextVisits.length > 0 && (
              <p className="mt-0.5 text-charcoal-muted">
                Next visits:{' '}
                {preview.nextVisits.map((v) => `${visitDateLabel(v.date)}${v.isDeepClean ? ' (deep clean)' : ''}`).join(', ')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Ask the server how it reads the schedule, a moment after the last change. */
function useSchedulePreview(form: ScheduleForm, startDate: string, endDate: string): SchedulePreviewDto | null {
  const [preview, setPreview] = useState<SchedulePreviewDto | null>(null);
  const key = JSON.stringify([form, startDate, endDate]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api
        .schedulePreview({ ...scheduleInput('REPEATING', form), startDate: startDate || null, targetEndDate: endDate || null })
        .then((p) => { if (live) setPreview(p); })
        .catch(() => { if (live) setPreview(null); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
    // `key` stands for the form and both dates.
  }, [key]);
  return preview;
}
