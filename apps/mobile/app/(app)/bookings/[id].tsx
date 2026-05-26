import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { BookingDto, BookingStatus } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';

// Booking detail. Single screen for now — the photo gallery from mockup 11
// hooks in once the crew flow lands and photos exist.
export default function BookingDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : null;

  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getBooking(id);
      setBooking(res.booking);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load booking (${err.status}).` : 'Could not load booking.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCancel = () => {
    if (!booking) return;
    Alert.alert(
      'Cancel booking',
      `This will release the slot at ${formatNairobi(booking.scheduledAt)}. ${booking.status === 'CONFIRMED' ? 'Cancellation fees may apply close to the slot.' : ''}`,
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await api.cancelBooking(booking.id);
              setBooking(res.booking);
            } catch (err) {
              const msg =
                err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
                  ? String((err.payload as { error: unknown }).error)
                  : 'Could not cancel the booking.';
              Alert.alert('Cancel', msg);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleRetryPayment = async () => {
    if (!booking) return;
    setBusy(true);
    try {
      await api.initiatePayment({ bookingId: booking.id });
      await load();
      Alert.alert('Payment', 'M-Pesa prompt sent. Check your phone.');
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not start the M-Pesa prompt.';
      Alert.alert('Payment', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">
          {booking?.reference ?? 'Booking'}
        </Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!booking && !error && (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {booking && (
          <>
            <View className="px-5 pt-4">
              <View
                className="self-start rounded-pill px-3 py-1"
                style={{ backgroundColor: serviceLineColor(booking.serviceLineCode) + '20' }}
              >
                <Text
                  className="text-xs uppercase tracking-widest"
                  style={{ color: serviceLineColor(booking.serviceLineCode) }}
                >
                  ● {serviceLineLabel(booking.serviceLineCode)}
                </Text>
              </View>

              <Text className="text-text text-4xl mt-3" style={{ fontFamily: 'serif' }}>
                {cleanTypeLabel(booking.cleanTypeCode)}
              </Text>
              <Text className="text-text-muted text-base mt-1">
                {booking.scope.bedrooms} bed · {booking.scope.bathrooms} bath · {booking.scope.livingRooms} living
                {booking.scope.squareMeters ? ` · ~${booking.scope.squareMeters} m²` : ''}
              </Text>
            </View>

            <View className="mx-5 mt-5 rounded-xl bg-surface border border-border p-4">
              <Row label="When" value={formatNairobi(booking.scheduledAt)} />
              <Divider />
              <Row label="Where" value={`${booking.address.line1}${booking.address.area ? ` · ${booking.address.area}` : ''}`} />
              {booking.address.accessNotes && (
                <>
                  <Divider />
                  <Row label="Access" value={booking.address.accessNotes} />
                </>
              )}
              {booking.notesForCrew && (
                <>
                  <Divider />
                  <Row label="Notes for crew" value={booking.notesForCrew} />
                </>
              )}
              <Divider />
              <Row label="Status" valueComponent={<StatusPill status={booking.status} />} />
            </View>

            <View className="mx-5 mt-3 rounded-xl bg-surface border border-border p-4">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Receipt</Text>
              <View className="mt-2">
                <LineRow label={`${cleanTypeLabel(booking.cleanTypeCode)} base`} value={booking.basePriceCents} />
                {booking.addOns.map((a) => (
                  <LineRow key={a.id} label={a.name} value={a.priceCentsAtBooking} />
                ))}
                {booking.travelFeeCents !== 0 && (
                  <LineRow label={`Travel${booking.address.area ? ` · ${booking.address.area}` : ''}`} value={booking.travelFeeCents} />
                )}
                {booking.creditAppliedCents > 0 && <LineRow label="Credit applied" value={-booking.creditAppliedCents} positive />}
                {booking.discountCents > 0 && <LineRow label="Promo discount" value={-booking.discountCents} positive />}
              </View>
              <View className="h-px bg-border my-2" />
              <View className="flex-row justify-between">
                <Text className="text-text text-base font-medium">Total · via M-Pesa</Text>
                <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>
                  {formatKes(booking.totalCents)}
                </Text>
              </View>
            </View>

            <View className="mx-5 mt-3 flex-row items-center rounded-xl bg-surface-dark px-4 py-3">
              <View className="h-8 w-8 rounded-full bg-gold items-center justify-center">
                <Text className="text-surface-dark text-xs">★</Text>
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-text-on-dark text-sm">
                  {booking.status === 'COMPLETED' ? 'Credited' : "You'll earn"}{' '}
                  <Text className="text-gold">+{booking.pointsToEarn} Hawk Points</Text>
                </Text>
                <Text className="text-text-on-dark-muted text-xs mt-0.5">
                  {booking.status === 'COMPLETED' ? 'Already in your ledger.' : 'Credited after the crew completes.'}
                </Text>
              </View>
            </View>

            {booking.status === 'COMPLETED' && (
              <View className="mx-5 mt-3 rounded-xl bg-surface border border-border px-4 py-5 items-center">
                <Text className="text-text-muted text-xs uppercase tracking-widest">Before & after</Text>
                <Text className="text-text-muted text-sm mt-2 text-center">
                  Photos will appear here once the crew has uploaded them.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {booking && (
        <View className="absolute left-5 right-5 bottom-8 gap-2">
          {booking.status === 'PENDING_PAYMENT' && (
            <Pressable
              onPress={handleRetryPayment}
              disabled={busy}
              className="items-center rounded-lg bg-gold py-3"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              {busy ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Resend M-Pesa prompt</Text>}
            </Pressable>
          )}

          {(booking.status === 'PENDING_PAYMENT' || booking.status === 'CONFIRMED') && (
            <Pressable
              onPress={handleCancel}
              disabled={busy}
              className="items-center rounded-lg bg-surface border border-border py-3"
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <Text className="text-danger text-base">Cancel booking</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, valueComponent }: { label: string; value?: string; valueComponent?: React.ReactNode }) {
  return (
    <View className="flex-row justify-between py-2">
      <Text className="text-text-muted text-sm">{label}</Text>
      {valueComponent ?? <Text className="text-text text-sm text-right flex-shrink ml-3">{value}</Text>}
    </View>
  );
}

function LineRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-text text-sm flex-1 pr-2">{label}</Text>
      <Text className={positive ? 'text-success text-sm' : 'text-text text-sm'}>{formatKes(value)}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border" />;
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

function formatKes(amountCents: number): string {
  const kes = Math.abs(amountCents) / 100;
  const sign = amountCents < 0 ? '−' : '';
  return `${sign}KSh ${kes.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatNairobi(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).replace(',', '') + ' · ' +
    d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
}
