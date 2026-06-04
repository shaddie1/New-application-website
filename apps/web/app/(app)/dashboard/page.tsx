'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BookingDto, LoyaltyOverview, NotificationsResult } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';
import { bookingStatusLabel, bookingStatusTone, formatDateTime, money } from '../../../src/lib/format';
import { Banner, ButtonLink, Card, Pill, Spinner } from '../../../src/components/ui';

function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false }));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { session } = useAuth();
  const [upcoming, setUpcoming] = useState<BookingDto[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyOverview | null>(null);
  const [notifs, setNotifs] = useState<NotificationsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listBookings(), api.getLoyalty(), api.listNotifications()])
      .then(([b, l, n]) => {
        setUpcoming(b.upcoming);
        setLoyalty(l.loyalty);
        setNotifs(n);
      })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load your dashboard.')))
      .finally(() => setLoading(false));
  }, []);

  const firstName = session?.user.fullName.split(' ')[0] ?? '';
  const next = upcoming[0];

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">{greeting()},</p>
          <h1 className="font-serif text-3xl text-text">{firstName || 'there'}</h1>
        </div>
        <ButtonLink href="/book" size="lg">
          Book a clean
        </ButtonLink>
      </div>

      {error ? <Banner>{error}</Banner> : null}

      {/* Next booking */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Your next clean</h2>
        {next ? (
          <Link href={`/bookings/view?id=${next.id}`}>
            <Card className="bg-surface-dark text-text-on-dark transition-opacity hover:opacity-95">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-serif text-2xl">{formatDateTime(next.scheduledAt)}</p>
                  <p className="mt-1 text-sm text-text-on-dark-muted">
                    {next.cleanTypeCode.replace('_', ' ')} · {next.scope.bedrooms} bed / {next.scope.bathrooms} bath
                  </p>
                  <p className="mt-1 text-sm text-text-on-dark-muted">{next.address.label} · {next.address.area ?? next.address.city}</p>
                </div>
                <Pill className="bg-white/15 text-text-on-dark">{bookingStatusLabel(next.status)}</Pill>
              </div>
              <p className="mt-4 text-sm text-text-on-dark-muted">
                {next.reference} · <span className="text-gold">{money(next.totalCents)}</span>
              </p>
            </Card>
          </Link>
        ) : (
          <Card className="text-center">
            <p className="text-text-muted">You have no upcoming cleans.</p>
            <div className="mt-4 flex justify-center">
              <ButtonLink href="/book">Book your first clean</ButtonLink>
            </div>
          </Card>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Loyalty */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Hawk Points</h2>
          {loyalty ? (
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-3xl text-text">{loyalty.balancePoints.toLocaleString()}</span>
                <Pill className="bg-gold-soft text-gold-deep">{loyalty.tier}</Pill>
              </div>
              <p className="mt-1 text-sm text-text-muted">spendable points</p>
              {loyalty.next ? (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-pill bg-bg-muted">
                    <div
                      className="h-full rounded-pill bg-gold"
                      style={{ width: `${progressPct(loyalty)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {loyalty.pointsRemaining.toLocaleString()} pts to {loyalty.next}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gold-deep">You’ve reached the top tier 🎉</p>
              )}
              <Link href="/loyalty" className="mt-4 inline-block text-sm text-gold-deep hover:underline">
                View history →
              </Link>
            </Card>
          ) : null}
        </section>

        {/* Notifications */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">
            Recent activity
            {notifs && notifs.unreadCount > 0 ? (
              <span className="ml-2 rounded-pill bg-danger px-2 py-0.5 text-xs text-text-on-dark">
                {notifs.unreadCount}
              </span>
            ) : null}
          </h2>
          <Card>
            {notifs && notifs.notifications.length > 0 ? (
              <ul className="divide-y divide-border">
                {notifs.notifications.slice(0, 4).map((n) => (
                  <li key={n.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-pill ${n.readAt ? 'bg-border-strong' : 'bg-gold'}`} />
                    <div>
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <p className="text-sm text-text-muted">{n.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-text-muted">Nothing new yet.</p>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function progressPct(l: LoyaltyOverview): number {
  const earnedToward = l.lifetimeEarnedPoints + l.pointsRemaining;
  if (earnedToward <= 0) return 0;
  return Math.min(100, Math.round((l.lifetimeEarnedPoints / earnedToward) * 100));
}
