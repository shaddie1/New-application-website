import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { BookingDto, PaymentDto, QuoteResult } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';
import { useBookingStore } from '../../../src/booking/store';

type Stage =
  | { kind: 'reviewing' }              // line items + Confirm button
  | { kind: 'paying'; booking: BookingDto; payment: PaymentDto } // STK push waiting
  | { kind: 'succeeded'; booking: BookingDto }                    // mockup 07 result
  | { kind: 'failed'; booking: BookingDto; reason: string };

// Mockup 07 (review) → mockup 16 (STK push) → mockup 07 (success).
export default function ConfirmScreen() {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);
  const reset = useBookingStore((s) => s.reset);

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'reviewing' });

  // Bounce back to start if any earlier step is missing.
  useEffect(() => {
    if (!draft.serviceLineCode || !draft.cleanTypeCode || !draft.addressId || !draft.scheduledAt) {
      router.replace('/(app)/booking');
    }
  }, [draft]);

  useEffect(() => {
    if (stage.kind !== 'reviewing') return;
    if (!draft.serviceLineCode || !draft.cleanTypeCode || !draft.addressId || !draft.scheduledAt) return;
    let active = true;
    api
      .quoteBooking({
        serviceLineCode: draft.serviceLineCode,
        scope: {
          bedrooms: draft.bedrooms,
          bathrooms: draft.bathrooms,
          livingRooms: draft.livingRooms,
          squareMeters: draft.squareMeters ?? undefined,
          cleanTypeCode: draft.cleanTypeCode,
          addOnCodes: draft.addOnCodes,
        },
        addressId: draft.addressId,
        scheduledAt: draft.scheduledAt,
      })
      .then((res) => {
        if (active) setQuote(res.quote);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setQuoteError(err instanceof ApiError ? `Could not price this booking (${err.status}).` : 'Could not price this booking.');
      });
    return () => {
      active = false;
    };
  }, [draft, stage.kind]);

  const handleConfirm = async () => {
    if (!draft.serviceLineCode || !draft.cleanTypeCode || !draft.addressId || !draft.scheduledAt) return;
    setSubmitting(true);
    try {
      const bookingRes = await api.createBooking({
        serviceLineCode: draft.serviceLineCode,
        scope: {
          bedrooms: draft.bedrooms,
          bathrooms: draft.bathrooms,
          livingRooms: draft.livingRooms,
          squareMeters: draft.squareMeters ?? undefined,
          cleanTypeCode: draft.cleanTypeCode,
          addOnCodes: draft.addOnCodes,
        },
        addressId: draft.addressId,
        scheduledAt: draft.scheduledAt,
        notesForCrew: draft.notesForCrew ?? undefined,
      });

      const payRes = await api.initiatePayment({ bookingId: bookingRes.booking.id });
      setStage({ kind: 'paying', booking: bookingRes.booking, payment: payRes.payment });
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not confirm the booking. Try again in a moment.';
      Alert.alert('Booking', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft.serviceLineCode || !draft.cleanTypeCode || !draft.addressId || !draft.scheduledAt) return null;

  if (stage.kind === 'succeeded') {
    return <BookedView booking={stage.booking} onDone={() => { reset(); router.replace('/(app)'); }} />;
  }

  if (stage.kind === 'paying') {
    return (
      <StkPushView
        booking={stage.booking}
        payment={stage.payment}
        onSucceeded={(b) => setStage({ kind: 'succeeded', booking: b })}
        onFailed={(reason) => setStage({ kind: 'failed', booking: stage.booking, reason })}
        onPaymentUpdated={(payment) => setStage({ kind: 'paying', booking: stage.booking, payment })}
        onCancel={() => setStage({ kind: 'failed', booking: stage.booking, reason: 'You cancelled the request.' })}
      />
    );
  }

  if (stage.kind === 'failed') {
    return (
      <PaymentFailedView
        booking={stage.booking}
        reason={stage.reason}
        onRetry={async () => {
          try {
            const payRes = await api.initiatePayment({ bookingId: stage.booking.id });
            setStage({ kind: 'paying', booking: stage.booking, payment: payRes.payment });
          } catch (err) {
            const msg =
              err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
                ? String((err.payload as { error: unknown }).error)
                : 'Could not resend the request.';
            Alert.alert('Payment', msg);
          }
        }}
        onBack={() => { reset(); router.replace('/(app)'); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <StepDots step={3} />
        <Text className="text-text-muted text-sm">Step 3 / 3</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-6">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Review &{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              confirm.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Your crew is one tap away.
          </Text>
        </View>

        <View className="mx-5 mt-6 rounded-xl bg-surface border border-border p-4">
          <View
            className="self-start rounded-pill px-3 py-1"
            style={{ backgroundColor: (draft.serviceLineColorHex ?? '#C9A55C') + '20' }}
          >
            <Text
              className="text-xs uppercase tracking-widest"
              style={{ color: draft.serviceLineColorHex ?? '#A78445' }}
            >
              ● {draft.serviceLineName}
            </Text>
          </View>
          <Text className="text-text text-2xl mt-3" style={{ fontFamily: 'serif' }}>
            {draft.cleanTypeName} · {draft.bedrooms} bed / {draft.bathrooms} bath
          </Text>
          <Text className="text-text-muted text-sm mt-1">{formatNairobi(draft.scheduledAt)}</Text>
        </View>

        {quoteError && (
          <View className="mx-5 mt-4 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{quoteError}</Text>
          </View>
        )}

        {!quote && !quoteError && (
          <View className="mt-8 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {quote && (
          <>
            <View className="mx-5 mt-4 rounded-xl bg-surface border border-border p-4">
              {quote.lineItems.map((li, i) => (
                <View key={i} className="flex-row justify-between py-1.5">
                  <Text className="text-text text-sm flex-1 pr-2">{li.label}</Text>
                  <Text className={li.amountCents < 0 ? 'text-success text-sm' : 'text-text text-sm'}>
                    {formatKes(li.amountCents)}
                  </Text>
                </View>
              ))}
              <View className="h-px bg-border my-2" />
              <View className="flex-row justify-between">
                <Text className="text-text text-base font-medium">Total · paid via M-Pesa</Text>
                <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>
                  {formatKes(quote.totalCents)}
                </Text>
              </View>
            </View>

            <View className="mx-5 mt-3 flex-row items-center rounded-xl bg-surface-dark px-4 py-3">
              <View className="h-8 w-8 rounded-full bg-gold items-center justify-center">
                <Text className="text-surface-dark text-xs">★</Text>
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-text-on-dark text-sm">
                  You'll earn{' '}
                  <Text className="text-gold">+{quote.pointsToEarn} Hawk Points</Text>
                </Text>
                <Text className="text-text-on-dark-muted text-xs mt-0.5">
                  Credited after the crew completes
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View className="absolute left-5 right-5 bottom-8">
        <Pressable
          onPress={handleConfirm}
          disabled={!quote || submitting}
          className="items-center rounded-lg bg-gold px-4 py-4"
          style={{ opacity: !quote || submitting ? 0.6 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color="#1B1814" />
          ) : (
            <Text className="text-surface-dark text-base font-semibold">
              Confirm & pay {quote ? formatKes(quote.totalCents) : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STK push waiting view (mockup 16) — polls payment status until terminal.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

function StkPushView({
  booking,
  payment,
  onSucceeded,
  onFailed,
  onPaymentUpdated,
  onCancel,
}: {
  booking: BookingDto;
  payment: PaymentDto;
  onSucceeded: (booking: BookingDto) => void;
  onFailed: (reason: string) => void;
  onPaymentUpdated: (payment: PaymentDto) => void;
  onCancel: () => void;
}) {
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [resending, setResending] = useState(false);
  const latestStatusRef = useRef(payment.status);

  useEffect(() => {
    latestStatusRef.current = payment.status;
  }, [payment.status]);

  // Poll loop.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const res = await api.getPayment(payment.id);
        if (!active) return;
        latestStatusRef.current = res.payment.status;
        onPaymentUpdated(res.payment);

        if (res.payment.status === 'SUCCEEDED') {
          // Re-fetch the booking so we surface the CONFIRMED state in the UI.
          try {
            const bRes = await api.getBooking(booking.id);
            if (active) onSucceeded(bRes.booking);
          } catch {
            if (active) onSucceeded(booking);
          }
          return;
        }
        if (res.payment.status === 'FAILED' || res.payment.status === 'CANCELLED' || res.payment.status === 'TIMED_OUT') {
          if (active) onFailed(res.payment.failureReason ?? humanizeStatus(res.payment.status));
          return;
        }
      } catch {
        // Transient errors — keep polling until we time out.
      }
      if (Date.now() - startedAt.current >= POLL_TIMEOUT_MS) {
        if (active) onFailed("We didn't hear back from M-Pesa in time. Try resending the prompt.");
        return;
      }
      if (active) setTimeout(tick, POLL_INTERVAL_MS);
    };

    const t = setTimeout(tick, POLL_INTERVAL_MS);
    const elapsedT = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => {
      active = false;
      clearTimeout(t);
      clearInterval(elapsedT);
    };
  }, [payment.id, booking.id]);

  const remainingSeconds = Math.max(0, Math.ceil((POLL_TIMEOUT_MS - elapsed) / 1000));
  const mm = Math.floor(remainingSeconds / 60).toString();
  const ss = (remainingSeconds % 60).toString().padStart(2, '0');

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await api.initiatePayment({ bookingId: booking.id });
      onPaymentUpdated(res.payment);
      startedAt.current = Date.now();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not resend the prompt.';
      Alert.alert('Payment', msg);
    } finally {
      setResending(false);
    }
  };

  const status = payment.status;
  const checkSent = true;
  const awaitingPin = status === 'REQUESTED' || status === 'AWAITING_USER';
  const issued = status === 'SUCCEEDED';

  return (
    <SafeAreaView className="flex-1 bg-surface-dark" edges={['top', 'bottom']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <View className="h-10 w-10" />
        <View className="flex-row items-center">
          <View className="bg-success h-6 w-6 rounded-md items-center justify-center mr-2">
            <Text className="text-surface-dark text-xs font-bold">M</Text>
          </View>
          <View>
            <Text className="text-text-on-dark-muted text-[10px] uppercase tracking-widest">STK push</Text>
            <Text className="text-text-on-dark text-sm">Check your phone</Text>
          </View>
        </View>
        <View className="h-10 w-10" />
      </View>

      <View className="px-5 pt-10 items-center">
        <Text className="text-text-on-dark-muted text-xs uppercase tracking-widest">Amount due</Text>
        <Text className="text-gold text-5xl mt-2" style={{ fontFamily: 'serif' }}>
          {formatKes(booking.totalCents)}
        </Text>
        <Text className="text-text-on-dark-muted text-sm mt-2">
          To OnyxHawk · Till {booking.reference.replace(/[^0-9]/g, '').slice(-6) || '000 000'}
        </Text>
      </View>

      <View className="mx-5 mt-10 rounded-xl bg-surface/5 px-4 py-4 border border-text-on-dark-muted/20">
        <Text className="text-text-on-dark text-sm">
          Sent push to <Text className="text-gold">{payment.msisdn ?? '+254 …'}</Text>
        </Text>
        <Text className="text-text-on-dark-muted text-xs mt-0.5">
          Enter your M-Pesa PIN on the prompt to confirm.
        </Text>

        <View className="mt-4">
          <Step done={checkSent} label="Request sent" />
          <Step
            done={!awaitingPin && status !== 'PENDING'}
            active={awaitingPin}
            label="Awaiting your PIN"
            trailing={awaitingPin ? `${mm}:${ss}` : undefined}
          />
          <Step done={issued} label={issued ? `Receipt ${payment.mpesaReceiptNumber ?? 'issued'}` : 'Receipt issued'} />
        </View>
      </View>

      <View className="absolute left-5 right-5 bottom-24 flex-row gap-3">
        <Pressable onPress={onCancel} className="flex-1 items-center rounded-lg bg-surface/10 py-3">
          <Text className="text-text-on-dark text-sm">Cancel</Text>
        </Pressable>
        <Pressable onPress={handleResend} disabled={resending} className="flex-1 items-center rounded-lg bg-surface py-3">
          {resending ? <ActivityIndicator color="#1B1814" /> : <Text className="text-text text-sm font-semibold">Resend push</Text>}
        </Pressable>
      </View>

      <View className="absolute left-5 right-5 bottom-6 rounded-lg bg-gold-soft/20 px-3 py-2">
        <Text className="text-text-on-dark text-[11px]">
          Didn't get the prompt? Dial <Text className="text-gold">*334#</Text> → "Lipa na M-Pesa" → "Pay Bill" → {booking.reference}.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Step({
  done,
  active,
  label,
  trailing,
}: {
  done: boolean;
  active?: boolean;
  label: string;
  trailing?: string;
}) {
  return (
    <View className="flex-row items-center py-2">
      <View
        className="h-5 w-5 rounded-full items-center justify-center mr-3"
        style={{
          backgroundColor: done ? '#C9A55C' : active ? 'transparent' : 'transparent',
          borderWidth: done ? 0 : 1.5,
          borderColor: active ? '#C9A55C' : '#5C544A',
        }}
      >
        {done && <Text className="text-surface-dark text-xs">✓</Text>}
      </View>
      <Text
        className="text-sm flex-1"
        style={{ color: done ? '#F5F1E6' : active ? '#F5F1E6' : '#B6AC9A' }}
      >
        {label}
      </Text>
      {trailing && <Text className="text-gold text-sm">{trailing}</Text>}
    </View>
  );
}

function humanizeStatus(s: 'FAILED' | 'CANCELLED' | 'TIMED_OUT'): string {
  switch (s) {
    case 'CANCELLED':
      return 'You cancelled the M-Pesa request.';
    case 'TIMED_OUT':
      return "The M-Pesa prompt timed out before you entered your PIN.";
    default:
      return 'The M-Pesa request failed. Please try again.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Result views
// ─────────────────────────────────────────────────────────────────────────────

function PaymentFailedView({
  booking,
  reason,
  onRetry,
  onBack,
}: {
  booking: BookingDto;
  reason: string;
  onRetry: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-6">
        <View className="h-16 w-16 rounded-full border-2 border-danger items-center justify-center">
          <Text className="text-danger text-2xl">!</Text>
        </View>
        <Text className="text-text text-3xl mt-6 text-center" style={{ fontFamily: 'serif' }}>
          Payment didn't go through.
        </Text>
        <Text className="text-text-muted text-sm mt-3 text-center">{reason}</Text>
        <Text className="text-text-muted text-xs mt-4 text-center">
          Booking {booking.reference} is held — pay any time before {formatNairobi(booking.scheduledAt)}.
        </Text>

        <View className="self-stretch mt-8 gap-3">
          <Pressable
            onPress={async () => {
              setRetrying(true);
              await onRetry();
              setRetrying(false);
            }}
            disabled={retrying}
            className="items-center rounded-lg bg-gold py-3"
            style={{ opacity: retrying ? 0.6 : 1 }}
          >
            {retrying ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Resend M-Pesa prompt</Text>}
          </Pressable>
          <Pressable onPress={onBack} className="items-center rounded-lg bg-surface border border-border py-3">
            <Text className="text-text text-base">Back to home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function BookedView({ booking, onDone }: { booking: BookingDto; onDone: () => void }) {
  return (
    <SafeAreaView className="flex-1 bg-surface-dark" edges={['top', 'bottom']}>
      <View className="px-5 pt-6 items-end">
        <Pressable onPress={onDone} className="h-10 w-10 items-center justify-center rounded-full bg-surface/10">
          <Text className="text-text-on-dark text-xl">×</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center px-6 pt-6">
        <View className="h-20 w-20 rounded-full border-2 border-gold items-center justify-center">
          <Text className="text-gold text-3xl">✓</Text>
        </View>

        <Text className="text-gold text-xs uppercase tracking-widest mt-6">
          Confirmed · {booking.reference}
        </Text>
        <Text className="text-text-on-dark text-4xl mt-3" style={{ fontFamily: 'serif' }}>
          Booked.
        </Text>
        <Text className="text-text-on-dark-muted text-sm mt-2 text-center">
          Your crew is scheduled for{' '}
          <Text className="text-gold">{formatNairobi(booking.scheduledAt)}</Text>.
        </Text>

        <View className="self-stretch mt-6 rounded-xl bg-surface p-4">
          <Text className="text-text text-2xl" style={{ fontFamily: 'serif' }}>
            {booking.cleanTypeCode === 'deep' ? 'Deep' : booking.cleanTypeCode === 'move_out' ? 'Move-out' : 'Standard'} clean · {booking.scope.bedrooms} bed / {booking.scope.bathrooms} bath
          </Text>
          <View className="flex-row justify-between mt-3">
            <Text className="text-text-muted text-sm">Total · paid via M-Pesa</Text>
            <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>
              {formatKes(booking.totalCents)}
            </Text>
          </View>
          <View className="mt-3 rounded-md bg-gold-soft/40 px-3 py-2 flex-row items-center">
            <Text className="text-surface-dark text-xs">
              ★ You'll earn <Text className="font-semibold">+{booking.pointsToEarn} Hawk Points</Text> when the crew completes.
            </Text>
          </View>
        </View>

        <View className="self-stretch mt-6 flex-row gap-3">
          <Pressable onPress={onDone} className="flex-1 items-center rounded-lg bg-surface/10 py-3">
            <Text className="text-text-on-dark text-sm">Back to home</Text>
          </Pressable>
          <Pressable onPress={onDone} className="flex-1 items-center rounded-lg bg-gold py-3">
            <Text className="text-surface-dark text-sm font-semibold">Track crew →</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className="h-1.5 rounded-full"
          style={{ width: i === step ? 24 : 12, backgroundColor: i === step ? '#C9A55C' : '#E2DCC9' }}
        />
      ))}
    </View>
  );
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
