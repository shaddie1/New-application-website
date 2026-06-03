'use client';

import { useEffect, useState } from 'react';
import type { LoyaltyOverview, PointsLedgerEntry } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { formatDate } from '../../../src/lib/format';
import { Banner, Card, Pill, Spinner } from '../../../src/components/ui';

const TIERS: { tier: string; min: number }[] = [
  { tier: 'Bronze', min: 0 },
  { tier: 'Silver', min: 500 },
  { tier: 'Gold', min: 1000 },
  { tier: 'Platinum', min: 2000 },
];

export default function LoyaltyPage() {
  const [loyalty, setLoyalty] = useState<LoyaltyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLoyalty()
      .then((r) => setLoyalty(r.loyalty))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  if (!loyalty) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        {error ? <Banner>{error}</Banner> : <Spinner />}
      </div>
    );
  }

  const nextThreshold = loyalty.lifetimeEarnedPoints + loyalty.pointsRemaining;
  const pct = loyalty.next && nextThreshold > 0 ? Math.min(100, Math.round((loyalty.lifetimeEarnedPoints / nextThreshold) * 100)) : 100;

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl text-text">Hawk Points</h1>

      <Card className="bg-surface-dark text-text-on-dark">
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-4xl">{loyalty.balancePoints.toLocaleString()}</span>
          <Pill className="bg-gold text-surface-dark">{loyalty.tier}</Pill>
        </div>
        <p className="mt-1 text-sm text-text-on-dark-muted">spendable points</p>

        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-pill bg-white/15">
            <div className="h-full rounded-pill bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-text-on-dark-muted">
            {loyalty.next
              ? `${loyalty.pointsRemaining.toLocaleString()} pts to ${loyalty.next}`
              : 'Top tier reached 🎉'}
          </p>
        </div>
        <p className="mt-4 text-xs text-text-on-dark-muted">
          {loyalty.lifetimeEarnedPoints.toLocaleString()} lifetime points earned
        </p>
      </Card>

      {/* Tiers */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Tiers</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TIERS.map((t) => {
            const reached = loyalty.lifetimeEarnedPoints >= t.min;
            return (
              <Card key={t.tier} className={reached ? 'border-gold' : ''}>
                <p className="font-medium text-text">{t.tier}</p>
                <p className="text-sm text-text-muted">{t.min.toLocaleString()}+ pts</p>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-text-muted">
          Earn 10 points per KSh 100 spent — doubled on weekend bookings.
        </p>
      </section>

      {/* Ledger */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Recent activity</h2>
        {loyalty.recentLedger.length === 0 ? (
          <Card className="text-text-muted">No points activity yet — book a clean to start earning.</Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {loyalty.recentLedger.map((e) => (
                <LedgerRow key={e.id} entry={e} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function LedgerRow({ entry }: { entry: PointsLedgerEntry }) {
  const credit = entry.direction === 'CREDIT';
  return (
    <li className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-text">{entry.description ?? reasonLabel(entry.reason)}</p>
        <p className="text-xs text-text-muted">{formatDate(entry.createdAt)}</p>
      </div>
      <span className={`text-sm font-medium ${credit ? 'text-success' : 'text-text-muted'}`}>
        {credit ? '+' : '−'}
        {entry.points.toLocaleString()}
      </span>
    </li>
  );
}

function reasonLabel(reason: PointsLedgerEntry['reason']): string {
  return reason
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
