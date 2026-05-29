import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { LoyaltyOverview, LoyaltyTier, PointsLedgerEntry, PointsReason } from '@onyxhawk/types';

import { api, ApiError } from '../../src/api/client';

// Mockup 14 — Hawk Points: tier card, how-it-works, recent ledger.
export default function LoyaltyScreen() {
  const router = useRouter();
  const [data, setData] = useState<LoyaltyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getLoyalty();
      setData(res.loyalty);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load points (${err.status}).` : 'Could not load points.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Hawk Points</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!data && !error && (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {data && (
          <>
            <TierCard overview={data} />

            <View className="mt-8 px-5">
              <Text className="text-text-muted text-xs uppercase tracking-widest">How it works</Text>
              <Text className="text-text text-3xl mt-1" style={{ fontFamily: 'serif' }}>
                Earn on every sweep
              </Text>
            </View>

            <View className="mx-5 mt-3 flex-row flex-wrap" style={{ gap: 12 }}>
              <EarnTile points="10 pts" label="PER KSH 100" sub="On every clean" />
              <EarnTile points="500 pts" label="PER REFERRAL" sub="Friend joins & books" />
              <EarnTile points="200 pts" label="BONUS" sub="Recurring contract" />
              <EarnTile points="2× pts" label="WEEKENDS" sub="Sat/Sun bookings" />
            </View>

            <View className="mt-8 px-5 flex-row items-end justify-between">
              <View>
                <Text className="text-text-muted text-xs uppercase tracking-widest">Ledger</Text>
                <Text className="text-text text-2xl mt-1" style={{ fontFamily: 'serif' }}>
                  Recent points
                </Text>
              </View>
              {data.recentLedger.length > 0 && (
                <Text className="text-gold-deep text-sm">{data.recentLedger.length} entries</Text>
              )}
            </View>

            {data.recentLedger.length === 0 && (
              <View className="mx-5 mt-3 rounded-xl bg-surface border border-border px-5 py-8 items-center">
                <Text className="text-text-muted text-sm text-center">
                  No points yet — your first booking lands you in Silver.
                </Text>
              </View>
            )}

            <View className="px-5 mt-3">
              {data.recentLedger.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TierCard({ overview }: { overview: LoyaltyOverview }) {
  const progressPct = computeTierProgress(overview);
  const worth = overview.balancePoints; // 1 pt = KSh 1 redemption (per mockup 14 copy)

  return (
    <View className="mx-5 mt-6 rounded-2xl bg-surface-dark p-6 overflow-hidden">
      <View className="flex-row items-center justify-between">
        <Text className="text-gold text-xs uppercase tracking-widest">
          Hawk Points · {overview.tier} tier
        </Text>
        <Text className="text-text-on-dark-muted text-base">{tierGlyph(overview.tier)}</Text>
      </View>

      <Text className="text-text-on-dark mt-4 text-5xl" style={{ fontFamily: 'serif' }}>
        {overview.balancePoints.toLocaleString()}{' '}
        <Text className="text-text-on-dark-muted text-2xl">pts</Text>
      </Text>
      <Text className="text-text-on-dark-muted italic mt-1" style={{ fontFamily: 'serif' }}>
        Worth KSh {worth.toLocaleString()} on your next clean.
      </Text>

      <View className="mt-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-gold text-xs uppercase tracking-widest">{overview.tier}</Text>
          {overview.next ? (
            <Text className="text-text-on-dark-muted text-xs">
              {overview.pointsRemaining.toLocaleString()} pts to {overview.next}
            </Text>
          ) : (
            <Text className="text-gold text-xs">Top tier ✓</Text>
          )}
        </View>
        <View className="mt-2 h-1.5 rounded-full bg-text-on-dark-muted/30 overflow-hidden">
          <View className="h-full rounded-full bg-gold" style={{ width: `${progressPct}%` }} />
        </View>
      </View>
    </View>
  );
}

function EarnTile({ points, label, sub }: { points: string; label: string; sub: string }) {
  return (
    <View className="rounded-xl bg-surface border border-border p-4" style={{ width: '47%' }}>
      <Text className="text-gold-deep text-2xl" style={{ fontFamily: 'serif' }}>
        {points}
      </Text>
      <Text className="text-text-muted text-[10px] uppercase tracking-widest mt-1">{label}</Text>
      <Text className="text-text text-sm mt-1">{sub}</Text>
    </View>
  );
}

function LedgerRow({ entry }: { entry: PointsLedgerEntry }) {
  const positive = entry.direction === 'CREDIT';
  const sign = positive ? '+' : '−';
  return (
    <View className="mt-3 rounded-xl bg-surface border border-border px-4 py-3 flex-row items-center">
      <View
        className="h-9 w-9 rounded-full items-center justify-center"
        style={{ backgroundColor: positive ? '#C9A55C22' : '#B1474722' }}
      >
        <Text style={{ color: positive ? '#A78445' : '#B14747' }} className="text-lg">
          {positive ? '★' : '−'}
        </Text>
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-text text-base" numberOfLines={1}>
          {entry.description ?? reasonLabel(entry.reason)}
        </Text>
        <Text className="text-text-muted text-xs mt-0.5">{formatLedgerDate(entry.createdAt)}</Text>
      </View>
      <Text
        className="text-base font-medium"
        style={{ color: positive ? '#A78445' : '#B14747' }}
      >
        {sign} {entry.points.toLocaleString()}
      </Text>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TIER_THRESHOLDS: Array<{ tier: LoyaltyTier; minPoints: number }> = [
  { tier: 'BRONZE', minPoints: 0 },
  { tier: 'SILVER', minPoints: 500 },
  { tier: 'GOLD', minPoints: 1000 },
  { tier: 'PLATINUM', minPoints: 2000 },
];

function computeTierProgress(o: LoyaltyOverview): number {
  if (!o.next) return 100;
  const currentMin = TIER_THRESHOLDS.find((t) => t.tier === o.tier)?.minPoints ?? 0;
  const nextMin = TIER_THRESHOLDS.find((t) => t.tier === o.next)?.minPoints ?? o.lifetimeEarnedPoints + o.pointsRemaining;
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, ((o.lifetimeEarnedPoints - currentMin) / span) * 100));
}

function tierGlyph(tier: LoyaltyTier): string {
  switch (tier) {
    case 'BRONZE':   return '⌬';
    case 'SILVER':   return '◈';
    case 'GOLD':     return '✦';
    case 'PLATINUM': return '✸';
  }
}

function reasonLabel(reason: PointsReason): string {
  switch (reason) {
    case 'BOOKING_BASE':        return 'Booking points';
    case 'WEEKEND_MULTIPLIER':  return 'Weekend bonus';
    case 'RECURRING_BONUS':     return 'Recurring contract bonus';
    case 'REFERRAL':            return 'Referral bonus';
    case 'PHOTO_DOCUMENTATION': return 'Photo documentation';
    case 'TIER_BONUS':          return 'Tier bonus';
    case 'REDEMPTION':          return 'Redemption';
    case 'REFUND_CLAWBACK':     return 'Refund clawback';
    case 'ADJUSTMENT':          return 'Adjustment';
  }
}

function formatLedgerDate(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', month: 'short', day: '2-digit' });
}
