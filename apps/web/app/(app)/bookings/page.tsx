'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BookingDto } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { bookingStatusLabel, bookingStatusTone, formatDateTime, money } from '../../../src/lib/format';
import { Banner, ButtonLink, Card, Pill, Spinner } from '../../../src/components/ui';

export default function BookingsPage() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [data, setData] = useState<{ upcoming: BookingDto[]; past: BookingDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBookings()
      .then(setData)
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  const list = data ? data[tab] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-text">My bookings</h1>
        <ButtonLink href="/book">Book a clean</ButtonLink>
      </div>

      <div className="flex gap-2">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-pill px-4 py-1.5 text-sm capitalize ${
              tab === t ? 'bg-surface-dark text-text-on-dark' : 'bg-bg-muted text-text-muted'
            }`}
          >
            {t}
            {data ? ` (${data[t].length})` : ''}
          </button>
        ))}
      </div>

      {error ? <Banner>{error}</Banner> : null}
      {!data && !error ? (
        <div className="flex justify-center py-16 text-text-muted"><Spinner /></div>
      ) : null}

      {data && list.length === 0 ? (
        <Card className="text-center text-text-muted">No {tab} bookings.</Card>
      ) : null}

      <div className="space-y-3">
        {list.map((b) => (
          <Link key={b.id} href={`/bookings/view?id=${b.id}`}>
            <Card className="flex items-center justify-between transition-colors hover:border-gold">
              <div>
                <p className="font-medium text-text">{formatDateTime(b.scheduledAt)}</p>
                <p className="text-sm text-text-muted">
                  {b.cleanTypeCode.replace('_', ' ')} · {b.scope.bedrooms} bed / {b.scope.bathrooms} bath ·{' '}
                  {b.address.area ?? b.address.city}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {b.reference} · <span className="text-text">{money(b.totalCents)}</span>
                </p>
              </div>
              <Pill className={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status)}</Pill>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
