'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminStats } from '@onyxhawk/types';
import { api, ApiError } from '../../src/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then((res) => setStats(res.stats))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? `Could not load stats (${err.status}).` : 'Could not load stats.'),
      );
  }, []);

  return (
    <div>
      <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
        Today at a glance
      </h1>

      {error && <div className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Awaiting payment" value={stats?.pendingPayment} href="/bookings?status=PENDING_PAYMENT" />
        <StatCard label="Confirmed" value={stats?.confirmed} href="/bookings?status=CONFIRMED" />
        <StatCard label="In progress" value={stats?.inProgress} href="/bookings" />
        <StatCard label="Pending quotes" value={stats?.pendingQuotes} href="/quotes" accent />
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Link href="/bookings" className="rounded-xl border border-border bg-surface p-5 hover:border-gold">
          <h2 className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>Bookings</h2>
          <p className="text-text-muted text-sm mt-1">Review schedule, assign crews and leads.</p>
        </Link>
        <Link href="/quotes" className="rounded-xl border border-border bg-surface p-5 hover:border-gold">
          <h2 className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>Quote requests</h2>
          <p className="text-text-muted text-sm mt-1">Respond to walkthrough requests with a price.</p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, accent }: { label: string; value?: number; href: string; accent?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border p-5 ${accent ? 'border-gold bg-gold-soft/20' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
        {value ?? '—'}
      </p>
    </Link>
  );
}
