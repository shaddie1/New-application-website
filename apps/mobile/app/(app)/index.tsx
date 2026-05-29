import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { BookingDto } from '@onyxhawk/types';

import { useAuthStore } from '../../src/auth/store';
import { useBookingStore } from '../../src/booking/store';
import { api } from '../../src/api/client';

// Home screen — mockup 03 for customers; crew users are bounced to /crew.
export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const resetBooking = useBookingStore((s) => s.reset);

  useEffect(() => {
    if (session && (session.user.role === 'CREW' || session.user.role === 'CREW_LEAD')) {
      router.replace('/(app)/crew');
    }
  }, [session, router]);

  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);
  const [nextBooking, setNextBooking] = useState<BookingDto | null | undefined>(undefined);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [bookings, loyalty, notifs] = await Promise.all([
        api.listBookings(),
        api.getLoyalty().catch(() => null),
        api.listNotifications().catch(() => null),
      ]);
      setUpcomingCount(bookings.upcoming.length);
      setNextBooking(bookings.upcoming[0] ?? null);
      if (loyalty) {
        setPointsBalance(loyalty.loyalty.balancePoints);
        setTier(loyalty.loyalty.tier);
      }
      if (notifs) setUnread(notifs.unreadCount);
    } catch {
      // Soft-fail: leave the home card in its loading state. Don't block sign-out etc.
      setNextBooking(null);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!session) return null;

  const startBooking = () => {
    resetBooking();
    router.push('/(app)/booking');
  };

  const firstName = session.user.fullName.split(' ')[0];

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-2 flex-row items-start justify-between">
          <View>
            <Text className="text-text-muted text-xs uppercase tracking-widest">{todayLabel()}</Text>
            <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
              {greetingForNow()},
            </Text>
            <Text className="text-gold-deep text-4xl italic" style={{ fontFamily: 'serif' }}>
              {firstName}.
            </Text>
          </View>

          <View className="items-end mt-2 gap-2">
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => router.push('/(app)/notifications')}
                className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center"
              >
                <Text className="text-text text-base">🔔</Text>
                {unread > 0 && (
                  <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger items-center justify-center px-1">
                    <Text className="text-text-on-dark text-[10px] font-semibold">{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => router.push('/(app)/profile')}
                className="h-11 w-11 rounded-full bg-surface-dark items-center justify-center"
              >
                <Text className="text-gold text-base" style={{ fontFamily: 'serif' }}>{initialsFor(session.user.fullName)}</Text>
              </Pressable>
            </View>
            {upcomingCount !== null && upcomingCount > 0 && (
              <Pressable
                onPress={() => router.push('/(app)/bookings')}
                className="rounded-pill bg-surface border border-border px-3 py-1.5"
              >
                <Text className="text-text-muted text-xs uppercase tracking-widest">
                  {upcomingCount} upcoming →
                </Text>
              </Pressable>
            )}
            {pointsBalance !== null && (
              <Pressable
                onPress={() => router.push('/(app)/loyalty')}
                className="rounded-pill bg-surface-dark px-3 py-1.5 flex-row items-center"
              >
                <Text className="text-gold text-xs mr-1">★</Text>
                <Text className="text-text-on-dark text-xs uppercase tracking-widest">
                  {pointsBalance.toLocaleString()} pts{tier ? ` · ${tier.toLowerCase()}` : ''}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {nextBooking === undefined && (
          <View className="mx-5 mt-8 rounded-xl bg-surface-dark p-8 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {nextBooking === null && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border p-5">
            <Text className="text-text-muted text-xs uppercase tracking-widest">Next clean</Text>
            <Text className="text-text mt-2 text-2xl" style={{ fontFamily: 'serif' }}>
              Nothing on the calendar yet.
            </Text>
            <Text className="text-text-muted text-sm mt-1">
              Book one in under a minute and your crew will appear here.
            </Text>
          </View>
        )}

        {nextBooking && (
          <NextCleanCard
            booking={nextBooking}
            onTrack={() => router.push({ pathname: '/(app)/bookings/[id]', params: { id: nextBooking.id } })}
          />
        )}

        <View className="mt-8 px-5">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Book a clean</Text>
          <Text className="text-text mt-1 text-3xl" style={{ fontFamily: 'serif' }}>
            What needs sweeping?
          </Text>
        </View>

        <Pressable
          onPress={startBooking}
          className="mx-5 mt-4 rounded-xl bg-gold px-5 py-4 flex-row items-center justify-between"
        >
          <View>
            <Text className="text-surface-dark text-base font-semibold">Start a new booking</Text>
            <Text className="text-surface-dark/70 text-xs mt-0.5">Pick a service · scope · slot</Text>
          </View>
          <Text className="text-surface-dark text-xl">→</Text>
        </Pressable>

        <View className="mx-5 mt-3 flex-row" style={{ gap: 12 }}>
          <Pressable
            onPress={() => router.push('/(app)/bookings')}
            className="flex-1 rounded-xl bg-surface border border-border px-4 py-4"
          >
            <Text className="text-text text-base font-medium">Bookings</Text>
            <Text className="text-text-muted text-xs mt-0.5">Upcoming & past</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/calendar')}
            className="flex-1 rounded-xl bg-surface border border-border px-4 py-4"
          >
            <Text className="text-text text-base font-medium">Calendar</Text>
            <Text className="text-text-muted text-xs mt-0.5">Month · week · list</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/(app)/loyalty')}
          className="mx-5 mt-3 rounded-xl bg-surface border border-border px-5 py-4 flex-row items-center justify-between"
        >
          <View>
            <Text className="text-text text-base font-medium">
              Hawk Points{pointsBalance !== null ? ` · ${pointsBalance.toLocaleString()} pts` : ''}
            </Text>
            <Text className="text-text-muted text-xs mt-0.5">
              {tier ? `${tier.charAt(0) + tier.slice(1).toLowerCase()} tier · tier perks & ledger` : 'Tier perks & ledger'}
            </Text>
          </View>
          <Text className="text-gold-deep text-xl">★</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function NextCleanCard({ booking, onTrack }: { booking: BookingDto; onTrack: () => void }) {
  const d = new Date(booking.scheduledAt);
  const timeLabel = d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
  const dayLabel = isToday(d)
    ? 'TODAY'
    : isTomorrow(d)
    ? 'TOMORROW'
    : d.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  const durationLabel = formatDuration(booking.estimatedDurationMinutes);
  const lineColor = serviceLineColor(booking.serviceLineCode);
  const ctaLabel = booking.status === 'PENDING_PAYMENT' ? 'Complete payment →' : 'Track →';

  return (
    <View className="mx-5 mt-8 rounded-xl bg-surface-dark p-5">
      <View className="self-start rounded-pill px-3 py-1" style={{ backgroundColor: lineColor + '33' }}>
        <Text className="text-xs uppercase tracking-widest" style={{ color: lineColor }}>
          ● {serviceLineLabel(booking.serviceLineCode)}
        </Text>
      </View>
      <Text className="text-text-on-dark mt-3 text-2xl" style={{ fontFamily: 'serif' }}>
        {cleanTypeLabel(booking.cleanTypeCode)}
      </Text>
      <Text className="text-gold italic text-lg" style={{ fontFamily: 'serif' }}>
        {booking.scope.bedrooms > 0 ? `${booking.scope.bedrooms}-bedroom · ${booking.address.label}` : booking.address.label}
      </Text>

      <View className="mt-4 flex-row justify-between">
        <Column label={dayLabel} value={timeLabel} />
        <Column label="CREW" value="Assigned" />
        <Column label="EST." value={durationLabel} />
      </View>

      <Pressable onPress={onTrack} className="mt-4 self-end rounded-lg bg-gold px-4 py-2">
        <Text className="text-surface-dark font-semibold">{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

function Column({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-on-dark-muted text-[10px] uppercase tracking-widest">{label}</Text>
      <Text className="text-text-on-dark mt-1 text-base font-medium">{value}</Text>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function todayLabel(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      timeZone: 'Africa/Nairobi',
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    })
    .replace(',', ' ·');
}

function greetingForNow(): string {
  const hour = Number(
    new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function initialsFor(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function isToday(d: Date): boolean {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const target = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  return today === target;
}

function isTomorrow(d: Date): boolean {
  const tmr = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const target = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  return tmr === target;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function serviceLineColor(code: string): string {
  switch (code) {
    case 'residential': return '#4F7B5C';
    case 'office': return '#3A5E7A';
    case 'hospital': return '#A8556B';
    case 'post_build': return '#C97E3B';
    case 'fumigation': return '#6B4E8C';
    default: return '#C9A55C';
  }
}

function serviceLineLabel(code: string): string {
  switch (code) {
    case 'residential': return 'Residential';
    case 'office': return 'Office';
    case 'hospital': return 'Hospital';
    case 'post_build': return 'Post-build';
    case 'fumigation': return 'Fumigation';
    default: return code;
  }
}

function cleanTypeLabel(code: string): string {
  switch (code) {
    case 'deep': return 'Deep clean';
    case 'move_out': return 'Move-out clean';
    case 'recurring': return 'Recurring clean';
    default: return 'Standard clean';
  }
}
