'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdminBookingDto, BookingStatus } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';

const TZ = 'Africa/Nairobi';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Date helpers (work on abstract calendar dates so timezone never drifts) ──
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Nairobi calendar date (YYYY-MM-DD) of an ISO timestamp. */
function nairobiDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}
function nairobiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}
/** Today's Nairobi calendar date as {y, m (0-based), d}. */
function nairobiToday(): { y: number; m: number; d: number; key: string } {
  const key = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const [ys, ms, ds] = key.split('-');
  return { y: Number(ys), m: Number(ms) - 1, d: Number(ds), key };
}

const STATUS_TONE: Record<BookingStatus, string> = {
  DRAFT: 'bg-border-strong',
  PENDING_PAYMENT: 'bg-warning',
  CONFIRMED: 'bg-gold',
  EN_ROUTE: 'bg-gold-deep',
  IN_PROGRESS: 'bg-gold-deep',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-danger',
  NO_SHOW: 'bg-danger',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  DRAFT: 'Draft',
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  EN_ROUTE: 'En route',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

export default function CalendarPage() {
  const today = useMemo(nairobiToday, []);
  const [view, setView] = useState({ y: today.y, m: today.m });
  const [bookings, setBookings] = useState<AdminBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(today.key);

  useEffect(() => {
    api
      .bookings()
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError(e instanceof ApiError ? `Error ${e.status}` : 'Could not load bookings.'));
  }, []);

  // Group bookings by Nairobi date, sorted by time within each day.
  const byDate = useMemo(() => {
    const map = new Map<string, AdminBookingDto[]>();
    for (const b of bookings ?? []) {
      const k = nairobiDateKey(b.scheduledAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(b);
    }
    for (const list of map.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return map;
  }, [bookings]);

  // Build the 6-week grid (Monday-first) for the displayed month.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const out: { key: string; day: number; inMonth: boolean }[] = [];
    // leading days from previous month
    for (let i = firstWeekday; i > 0; i--) {
      const dt = new Date(Date.UTC(view.y, view.m, 1 - i));
      out.push({ key: keyOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()), day: dt.getUTCDate(), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) out.push({ key: keyOf(view.y, view.m, d), day: d, inMonth: true });
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1]!;
      const [ly, lm, ld] = last.key.split('-');
      const dt = new Date(Date.UTC(Number(ly), Number(lm) - 1, Number(ld) + 1));
      out.push({ key: keyOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()), day: dt.getUTCDate(), inMonth: false });
    }
    return out;
  }, [view]);

  const monthLabel = new Date(Date.UTC(view.y, view.m, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const move = (delta: number) => {
    const m = view.m + delta;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  const selectedList = byDate.get(selected) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
            Calendar
          </h1>
          <p className="text-text-muted text-sm mt-1">Every booking, by date and time — shared across the team.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">
            ‹
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</span>
          <button onClick={() => move(1)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">
            ›
          </button>
          <button
            onClick={() => {
              setView({ y: today.y, m: today.m });
              setSelected(today.key);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted"
          >
            Today
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* Month grid */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border bg-bg-muted text-text-muted text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center font-medium">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const items = byDate.get(c.key) ?? [];
            const isToday = c.key === today.key;
            const isSelected = c.key === selected;
            return (
              <button
                key={c.key}
                onClick={() => setSelected(c.key)}
                className={`min-h-[96px] border-b border-r border-border p-1.5 text-left align-top transition-colors ${
                  c.inMonth ? 'bg-surface' : 'bg-bg-muted/40'
                } ${isSelected ? 'ring-2 ring-gold ring-inset' : 'hover:bg-bg-muted/60'}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      isToday
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-surface-dark text-text-on-dark'
                        : c.inMonth
                          ? 'text-text'
                          : 'text-text-muted'
                    }`}
                  >
                    {c.day}
                  </span>
                  {items.length > 0 && <span className="text-[10px] text-text-muted">{items.length}</span>}
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((b) => (
                    <div key={b.id} className="flex items-center gap-1 truncate text-[11px] text-text">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_TONE[b.status]}`} />
                      <span className="text-text-muted">{nairobiTime(b.scheduledAt)}</span>
                      <span className="truncate">{b.customerName.split(' ')[0]}</span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-text-muted">+{items.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-text-muted">
        {(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'PENDING_PAYMENT', 'CANCELLED'] as BookingStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_TONE[s]}`} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {/* Selected day detail */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">
          {new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}
          {selectedList.length} {selectedList.length === 1 ? 'booking' : 'bookings'}
        </h2>
        <div className="mt-3 space-y-2">
          {selectedList.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">
              No bookings on this day.
            </div>
          ) : (
            selectedList.map((b) => (
              <div key={b.id} className="flex items-start gap-4 rounded-lg border border-border bg-surface px-4 py-3">
                <div className="w-16 shrink-0 text-sm">
                  <div className="font-medium text-text">{nairobiTime(b.scheduledAt)}</div>
                  <div className="text-xs text-text-muted">{Math.round(b.estimatedDurationMinutes / 60)}h</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_TONE[b.status]}`} />
                    <span className="font-medium text-text">{b.customerName}</span>
                    <span className="text-xs text-text-muted">{STATUS_LABEL[b.status]}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {b.serviceLineCode} · {b.cleanTypeCode.replace('_', ' ')} · {b.scope.bedrooms} bed / {b.scope.bathrooms} bath
                  </p>
                  <p className="text-sm text-text-muted">
                    {b.address.area ?? b.address.city} · {b.customerPhone} · {b.reference}
                  </p>
                  {b.crew.length > 0 && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      Crew: {b.crew.map((c) => `${c.name}${c.role === 'LEAD' ? ' (lead)' : ''}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
