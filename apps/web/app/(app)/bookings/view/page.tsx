'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { BookingDto, BookingPhotosResult, PaymentDto } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../../src/lib/api';
import {
  bookingStatusLabel,
  bookingStatusTone,
  duration,
  formatDateTime,
  money,
  paymentStatusLabel,
} from '../../../../src/lib/format';
import { Banner, Button, Card, Pill, Spinner } from '../../../../src/components/ui';

const PAY_TERMINAL = new Set<PaymentDto['status']>(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REFUNDED']);
const CANCELLABLE = new Set<BookingDto['status']>(['PENDING_PAYMENT', 'CONFIRMED']);

// useSearchParams must be inside a Suspense boundary for static export.
export default function BookingDetailPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-text-muted"><Spinner /></div>}>
      <BookingDetail />
    </Suspense>
  );
}

function BookingDetail() {
  const id = useSearchParams().get('id') ?? '';

  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [photos, setPhotos] = useState<BookingPhotosResult | null>(null);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing booking id.');
      return;
    }
    try {
      const [b, p] = await Promise.all([api.getBooking(id), api.getBookingPhotos(id).catch(() => null)]);
      setBooking(b.booking);
      setPhotos(p);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll an in-flight payment.
  useEffect(() => {
    if (!payment || PAY_TERMINAL.has(payment.status)) return;
    const pid = payment.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const r = await api.getPayment(pid);
        if (cancelled) return;
        setPayment(r.payment);
        if (r.payment.status === 'SUCCEEDED') void load();
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [payment, load]);

  async function retryPayment() {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.initiatePayment({ bookingId: booking.id });
      setPayment(r.payment);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!booking || !confirm('Cancel this booking?')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.cancelBooking(booking.id);
      setBooking(r.booking);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!booking) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        {error ? <Banner>{error}</Banner> : <Spinner />}
      </div>
    );
  }

  const payInFlight = payment && !PAY_TERMINAL.has(payment.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted">{booking.reference}</p>
          <h1 className="font-serif text-3xl text-text">{formatDateTime(booking.scheduledAt)}</h1>
        </div>
        <Pill className={bookingStatusTone(booking.status)}>{bookingStatusLabel(booking.status)}</Pill>
      </div>

      {error ? <Banner>{error}</Banner> : null}

      {/* Payment status when retrying */}
      {payment ? (
        payInFlight ? (
          <Banner tone="info">
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" /> {paymentStatusLabel(payment.status)} — check your phone for the M-Pesa prompt.
            </span>
          </Banner>
        ) : payment.status === 'SUCCEEDED' ? (
          <Banner tone="success">Payment received.</Banner>
        ) : (
          <Banner>{payment.failureReason ?? `Payment ${paymentStatusLabel(payment.status).toLowerCase()}.`}</Banner>
        )
      ) : null}

      <Card className="space-y-3">
        <Row label="Service" value={`${booking.serviceLineCode} · ${booking.cleanTypeCode.replace('_', ' ')}`} />
        <Row label="Scope" value={`${booking.scope.bedrooms} bed / ${booking.scope.bathrooms} bath / ${booking.scope.livingRooms} living`} />
        <Row label="Address" value={`${booking.address.line1}${booking.address.area ? `, ${booking.address.area}` : ''} · ${booking.address.city}`} />
        <Row label="Estimated time" value={duration(booking.estimatedDurationMinutes)} />
        {booking.notesForCrew ? <Row label="Notes" value={booking.notesForCrew} /> : null}
      </Card>

      {/* Price breakdown */}
      <Card className="space-y-2">
        <Row label="Base" value={money(booking.basePriceCents)} />
        {booking.addOns.map((a) => (
          <Row key={a.id} label={a.name} value={`+${money(a.priceCentsAtBooking)}`} />
        ))}
        {booking.travelFeeCents > 0 ? <Row label="Travel" value={money(booking.travelFeeCents)} /> : null}
        {booking.creditAppliedCents > 0 ? <Row label="Credit" value={`−${money(booking.creditAppliedCents)}`} /> : null}
        {booking.discountCents > 0 ? <Row label="Discount" value={`−${money(booking.discountCents)}`} /> : null}
        <div className="flex justify-between border-t border-border pt-2">
          <span className="font-medium text-text">Total</span>
          <span className="font-serif text-lg text-text">{money(booking.totalCents)}</span>
        </div>
        <div className="flex justify-between text-sm text-text-muted">
          <span>Hawk Points</span>
          <span className="text-gold-deep">+{booking.pointsToEarn}</span>
        </div>
      </Card>

      {/* Before / after photos */}
      {photos && photos.rooms.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Before & after</h2>
          <div className="space-y-4">
            {photos.rooms.map((room) => (
              <Card key={room.room}>
                <p className="mb-2 font-medium text-text">{room.room}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Photo label="Before" url={room.before?.thumbnailUrl ?? room.before?.url ?? null} />
                  <Photo label="After" url={room.after?.thumbnailUrl ?? room.after?.url ?? null} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {booking.status === 'PENDING_PAYMENT' && !payInFlight ? (
          <Button onClick={retryPayment} disabled={busy}>
            {busy ? <Spinner /> : 'Pay with M-Pesa'}
          </Button>
        ) : null}
        {CANCELLABLE.has(booking.status) ? (
          <Button variant="secondary" onClick={cancel} disabled={busy}>
            Cancel booking
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="mb-1 text-xs text-text-muted">{label}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="aspect-square w-full rounded-lg object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-bg-muted text-xs text-text-muted">
          No photo
        </div>
      )}
    </div>
  );
}
