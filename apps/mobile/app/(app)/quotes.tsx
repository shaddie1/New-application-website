import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { QuoteRequestDto, QuoteStatus, QuoteFrequency } from '@onyxhawk/types';

import { api, ApiError } from '../../src/api/client';

// List of the customer's quote requests + their status.
export default function QuotesScreen() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRequestDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listQuoteRequests();
      setQuotes(res.quoteRequests);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load quotes (${err.status}).` : 'Could not load quotes.');
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
        <Text className="text-text-muted text-xs uppercase tracking-widest">Quotes</Text>
        <Pressable onPress={() => router.push('/(app)/quote')} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">＋</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        <View className="px-5 pt-4">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Your{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              quotes.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Walkthrough requests and their status.
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!quotes && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {quotes && quotes.length === 0 && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border px-5 py-8 items-center">
            <Text className="text-text-muted text-sm text-center">
              No quote requests yet. For hospitals, post-construction or fumigation, request a walkthrough.
            </Text>
            <Pressable onPress={() => router.push('/(app)/quote')} className="mt-4 rounded-lg bg-gold px-4 py-2">
              <Text className="text-surface-dark text-sm font-semibold">Request a quote</Text>
            </Pressable>
          </View>
        )}

        <View className="px-5 mt-3">
          {(quotes ?? []).map((q) => (
            <View key={q.id} className="mt-3 rounded-xl bg-surface border border-border p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-gold-deep text-xs uppercase tracking-widest">{q.serviceLineName}</Text>
                <StatusPill status={q.status} />
              </View>
              <Text className="text-text text-lg mt-1" style={{ fontFamily: 'serif' }}>{q.siteType}</Text>
              <Text className="text-text-muted text-sm mt-1">
                {[
                  q.approxSqm ? `~${q.approxSqm.toLocaleString()} m²` : null,
                  q.floors ? `${q.floors} floor${q.floors > 1 ? 's' : ''}` : null,
                  frequencyLabel(q.frequency),
                ].filter(Boolean).join(' · ')}
              </Text>

              {q.status === 'QUOTED' && q.quotedAmountCents != null && (
                <View className="mt-3 rounded-lg bg-gold-soft/30 px-3 py-2">
                  <Text className="text-text text-sm">
                    Quoted: <Text className="font-semibold">KSh {(q.quotedAmountCents / 100).toLocaleString()}</Text>
                  </Text>
                </View>
              )}

              <Text className="text-text-muted text-xs mt-2">Requested {formatDate(q.createdAt)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: QuoteStatus }) {
  const { label, color, bg } = badge(status);
  return (
    <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-xs" style={{ color }}>{label}</Text>
    </View>
  );
}

function badge(status: QuoteStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'PENDING':              return { label: 'Pending', color: '#A78445', bg: '#E6CFA033' };
    case 'SITE_VISIT_SCHEDULED': return { label: 'Visit scheduled', color: '#3A5E7A', bg: '#3A5E7A22' };
    case 'QUOTED':               return { label: 'Quoted', color: '#4F7B5C', bg: '#4F7B5C22' };
    case 'WON':                  return { label: 'Booked', color: '#4F7B5C', bg: '#4F7B5C22' };
    case 'LOST':                 return { label: 'Closed', color: '#5C544A', bg: '#E2DCC9' };
    case 'CANCELLED':            return { label: 'Cancelled', color: '#5C544A', bg: '#E2DCC9' };
  }
}

function frequencyLabel(f: QuoteFrequency): string {
  switch (f) {
    case 'WEEKLY': return 'Weekly';
    case 'BIWEEKLY': return 'Biweekly';
    case 'MONTHLY': return 'Monthly';
    default: return 'One-off';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', month: 'short', day: '2-digit' });
}
