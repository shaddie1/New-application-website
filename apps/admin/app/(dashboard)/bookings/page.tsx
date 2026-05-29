'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminBookingDto, BookingStatus, CrewUserDto } from '@onyxhawk/types';
import { api, ApiError } from '../../../src/lib/api';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'EN_ROUTE', label: 'En route' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function BookingsPage() {
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<AdminBookingDto[] | null>(null);
  const [crew, setCrew] = useState<CrewUserDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<AdminBookingDto | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.bookings(status || undefined);
      setBookings(res.bookings);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load bookings (${err.status}).` : 'Could not load bookings.');
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.crewUsers().then((res) => setCrew(res.crew)).catch(() => setCrew([]));
  }, []);

  return (
    <div>
      <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Bookings</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1.5 text-sm border ${status === f.value ? 'bg-surface-dark text-text-on-dark border-surface-dark' : 'bg-surface text-text-muted border-border'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}
      {!bookings && !error && <p className="mt-6 text-text-muted">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="mt-6 text-text-muted">No bookings match this filter.</p>}

      <div className="mt-6 overflow-x-auto">
        {bookings && bookings.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left text-xs uppercase tracking-widest">
                <th className="py-2 pr-4">Ref</th>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Crew</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-3 pr-4 font-mono text-xs">{b.reference}</td>
                  <td className="py-3 pr-4">{formatWhen(b.scheduledAt)}</td>
                  <td className="py-3 pr-4">{b.customerName}<br /><span className="text-text-muted text-xs">{b.customerPhone}</span></td>
                  <td className="py-3 pr-4">{b.serviceLineCode} · {b.cleanTypeCode}</td>
                  <td className="py-3 pr-4"><StatusBadge status={b.status} /></td>
                  <td className="py-3 pr-4">{crewSummary(b)}</td>
                  <td className="py-3 pr-4">KSh {(b.totalCents / 100).toLocaleString()}</td>
                  <td className="py-3">
                    <button onClick={() => setActive(b)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                      Assign crew
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active && (
        <AssignModal
          booking={active}
          crew={crew}
          onClose={() => setActive(null)}
          onDone={(updated) => {
            setActive(null);
            setBookings((prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? null);
          }}
        />
      )}
    </div>
  );
}

function AssignModal({
  booking,
  crew,
  onClose,
  onDone,
}: {
  booking: AdminBookingDto;
  crew: CrewUserDto[];
  onClose: () => void;
  onDone: (updated: AdminBookingDto) => void;
}) {
  const [userId, setUserId] = useState(crew[0]?.id ?? '');
  const [role, setRole] = useState<'LEAD' | 'MEMBER'>('LEAD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(booking);

  const assign = async () => {
    if (!userId) { setError('Pick a crew member.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api.assignCrew(current.id, { userId, role });
      setCurrent(res.booking);
    } catch (err) {
      setError(messageFrom(err, 'Could not assign crew.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    setBusy(true);
    try {
      const res = await api.removeCrew(current.id, uid);
      setCurrent(res.booking);
    } catch (err) {
      setError(messageFrom(err, 'Could not remove crew.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-dark/50 flex items-center justify-center px-4 z-50" onClick={() => onDone(current)}>
      <div className="w-full max-w-md rounded-2xl bg-bg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Crew · {current.reference}</h2>
        <p className="text-text-muted text-sm mt-1">{formatWhen(current.scheduledAt)} · {current.address.line1}</p>

        {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-danger text-sm">{error}</div>}

        <div className="mt-4">
          <p className="text-text-muted text-xs uppercase tracking-widest">Assigned</p>
          {current.crew.length === 0 ? (
            <p className="text-text-muted text-sm mt-2">No one assigned yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {current.crew.map((c) => (
                <li key={c.userId} className="flex items-center justify-between rounded-lg bg-surface border border-border px-3 py-2">
                  <span className="text-sm">{c.name} · <span className="text-text-muted">{c.role}</span></span>
                  <button onClick={() => remove(c.userId)} disabled={busy} className="text-danger text-xs">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-text-muted text-xs uppercase tracking-widest">Add crew</p>
          {crew.length === 0 ? (
            <p className="text-text-muted text-sm mt-2">No crew users exist yet. Create users with role CREW or CREW_LEAD.</p>
          ) : (
            <>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5">
                {crew.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.role})</option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                {(['LEAD', 'MEMBER'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${role === r ? 'bg-surface-dark text-text-on-dark border-surface-dark' : 'bg-surface text-text-muted border-border'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button onClick={assign} disabled={busy} className="mt-3 w-full rounded-lg bg-gold py-2.5 font-semibold text-surface-dark disabled:opacity-50">
                {busy ? 'Saving…' : 'Assign'}
              </button>
            </>
          )}
        </div>

        <button onClick={() => onDone(current)} className="mt-5 w-full rounded-lg border border-border py-2.5 text-text">Done</button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const map: Partial<Record<BookingStatus, string>> = {
    PENDING_PAYMENT: 'bg-gold-soft text-gold-deep',
    CONFIRMED: 'bg-gold-soft text-gold-deep',
    EN_ROUTE: 'bg-service-office/20 text-service-office',
    IN_PROGRESS: 'bg-service-office/20 text-service-office',
    COMPLETED: 'bg-success/15 text-success',
    CANCELLED: 'bg-bg-muted text-text-muted',
    NO_SHOW: 'bg-danger/15 text-danger',
    DRAFT: 'bg-bg-muted text-text-muted',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status] ?? 'bg-bg-muted text-text-muted'}`}>{status.replace(/_/g, ' ')}</span>;
}

function crewSummary(b: AdminBookingDto): string {
  if (b.crew.length === 0) return '—';
  const lead = b.crew.find((c) => c.role === 'LEAD');
  const members = b.crew.filter((c) => c.role === 'MEMBER').length;
  return `${lead ? `${lead.name.split(' ')[0]} (lead)` : 'no lead'}${members ? ` +${members}` : ''}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload) {
    return String((err.payload as { error: unknown }).error);
  }
  return fallback;
}
