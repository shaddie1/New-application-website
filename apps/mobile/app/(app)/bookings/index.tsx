import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { BookingDto, BookingStatus } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';

// Mockup 10 — your bookings, upcoming + past.
export default function BookingsScreen() {
  const router = useRouter();
  const [data, setData] = useState<{ upcoming: BookingDto[]; past: BookingDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listBookings();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load bookings (${err.status}).` : 'Could not load bookings.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh whenever the screen comes back into focus (e.g. after a new booking).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const list = tab === 'upcoming' ? data?.upcoming ?? [] : data?.past ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">History</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        <View className="px-5 pt-4">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Your{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              bookings.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Past and upcoming, all in one ledger.
          </Text>
        </View>

        <View className="mx-5 mt-6 flex-row rounded-xl bg-surface border border-border p-1">
          <Tab
            label={`Upcoming · ${data?.upcoming.length ?? '–'}`}
            active={tab === 'upcoming'}
            onPress={() => setTab('upcoming')}
          />
          <Tab
            label={`Past · ${data?.past.length ?? '–'}`}
            active={tab === 'past'}
            onPress={() => setTab('past')}
          />
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!data && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {data && list.length === 0 && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border px-5 py-8 items-center">
            <Text className="text-text-muted text-sm text-center">
              {tab === 'upcoming'
                ? 'No upcoming cleans yet. Book one to see it here.'
                : 'No past bookings yet — your history will show up here.'}
            </Text>
            {tab === 'upcoming' && (
              <Pressable
                onPress={() => router.push('/(app)/booking')}
                className="mt-4 rounded-lg bg-gold px-4 py-2"
              >
                <Text className="text-surface-dark text-sm font-semibold">Book a clean</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="mt-3 px-5">
          {list.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onPress={() => router.push({ pathname: '/(app)/bookings/[id]', params: { id: b.id } })}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center rounded-lg py-2"
      style={{ backgroundColor: active ? '#1B1814' : 'transparent' }}
    >
      <Text className="text-sm" style={{ color: active ? '#F5F1E6' : '#5C544A' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function BookingCard({ booking, onPress }: { booking: BookingDto; onPress: () => void }) {
  const date = new Date(booking.scheduledAt);
  const month = date.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', month: 'short' }).toUpperCase();
  const day = date.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', day: '2-digit' });
  const weekday = date.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' });
  const time = date.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });

  const dotColor = serviceLineColor(booking.serviceLineCode);

  return (
    <Pressable onPress={onPress} className="mt-3 flex-row rounded-xl bg-surface border border-border overflow-hidden">
      <View className="w-20 bg-surface-dark items-center justify-center py-3">
        <Text className="text-gold text-xs uppercase tracking-widest">{month}</Text>
        <Text className="text-text-on-dark text-2xl mt-0.5" style={{ fontFamily: 'serif' }}>
          {day}
        </Text>
        <Text className="text-text-on-dark-muted text-xs uppercase">{weekday}</Text>
      </View>

      <View className="flex-1 p-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
            <Text className="text-xs uppercase tracking-widest ml-1.5" style={{ color: dotColor }}>
              {serviceLineLabel(booking.serviceLineCode)}
            </Text>
          </View>
          <Text className="text-text-muted text-xs">{booking.reference}</Text>
        </View>

        <Text className="text-text text-base mt-1.5" style={{ fontFamily: 'serif' }}>
          {summarizeBooking(booking)}
        </Text>

        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-text-muted text-sm">{time}</Text>
          <StatusPill status={booking.status} />
        </View>
      </View>
    </Pressable>
  );
}

function StatusPill({ status }: { status: BookingStatus }) {
  const { label, color, bg } = statusBadge(status);
  return (
    <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-xs" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function statusBadge(status: BookingStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'PENDING_PAYMENT':
      return { label: 'Awaiting payment', color: '#A78445', bg: '#E6CFA033' };
    case 'CONFIRMED':
      return { label: 'Crew assigned', color: '#A78445', bg: '#E6CFA033' };
    case 'EN_ROUTE':
      return { label: 'En route', color: '#3A5E7A', bg: '#3A5E7A22' };
    case 'IN_PROGRESS':
      return { label: 'In progress', color: '#3A5E7A', bg: '#3A5E7A22' };
    case 'COMPLETED':
      return { label: 'Completed', color: '#4F7B5C', bg: '#4F7B5C22' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: '#5C544A', bg: '#E2DCC9' };
    case 'NO_SHOW':
      return { label: 'No-show', color: '#B14747', bg: '#B1474722' };
    case 'DRAFT':
    default:
      return { label: 'Draft', color: '#5C544A', bg: '#E2DCC9' };
  }
}

function serviceLineColor(code: string): string {
  switch (code) {
    case 'residential':
      return '#4F7B5C';
    case 'office':
      return '#3A5E7A';
    case 'hospital':
      return '#A8556B';
    case 'post_build':
      return '#C97E3B';
    case 'fumigation':
      return '#6B4E8C';
    default:
      return '#C9A55C';
  }
}

function serviceLineLabel(code: string): string {
  switch (code) {
    case 'residential':
      return 'Residential';
    case 'office':
      return 'Office';
    case 'hospital':
      return 'Hospital';
    case 'post_build':
      return 'Post-build';
    case 'fumigation':
      return 'Fumigation';
    default:
      return code;
  }
}

function summarizeBooking(b: BookingDto): string {
  const cleanLabel =
    b.cleanTypeCode === 'deep'
      ? 'Deep clean'
      : b.cleanTypeCode === 'move_out'
      ? 'Move-out'
      : b.cleanTypeCode === 'recurring'
      ? 'Recurring'
      : 'Standard clean';
  if (b.serviceLineCode === 'office') return `${cleanLabel} · ${b.address.label}`;
  if (b.scope.bedrooms > 0) return `${cleanLabel} · ${b.scope.bedrooms}-bed`;
  return `${cleanLabel} · ${b.address.label}`;
}
