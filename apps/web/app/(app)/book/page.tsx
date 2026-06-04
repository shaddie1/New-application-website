'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AddOnDto,
  AddressDto,
  BookingDto,
  CleanTypeDto,
  PaymentDto,
  QuoteResult,
  ServiceLineDto,
  TimeSlot,
} from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { duration, formatTime, money } from '../../../src/lib/format';
import { Banner, Button, ButtonLink, Card, Field, Input, Spinner, Textarea } from '../../../src/components/ui';

type Step = 'service' | 'scope' | 'schedule' | 'review' | 'pay';
type Detail = ServiceLineDto & { cleanTypes: CleanTypeDto[]; addOns: AddOnDto[] };

const PAY_TERMINAL = new Set<PaymentDto['status']>(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REFUNDED']);

export default function BookPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('service');

  // Selections
  const [lines, setLines] = useState<ServiceLineDto[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cleanTypeCode, setCleanTypeCode] = useState<string>('');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [livingRooms, setLivingRooms] = useState(1);
  const [addOnCodes, setAddOnCodes] = useState<string[]>([]);

  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [addressId, setAddressId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [payment, setPayment] = useState<PaymentDto | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getServiceLines()
      .then((r) => setLines(r.serviceLines))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  // ── Step transitions ───────────────────────────────────────────────────
  async function chooseService(line: ServiceLineDto) {
    if (line.quoteOnly) {
      router.push('/quote');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.getServiceLine(line.code);
      setDetail(r.serviceLine);
      setCleanTypeCode(r.serviceLine.cleanTypes[0]?.code ?? '');
      setStep('scope');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function goToSchedule() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.listAddresses();
      setAddresses(r.addresses);
      const def = r.addresses.find((a) => a.isDefault) ?? r.addresses[0];
      if (def) setAddressId(def.id);
      setStep('schedule');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickDate(d: string) {
    setDate(d);
    setScheduledAt('');
    setSlots(null);
    try {
      const r = await api.getAvailability(d);
      setSlots(r.slots);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function goToReview() {
    if (!detail || !addressId || !scheduledAt) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.quoteBooking({
        serviceLineCode: detail.code,
        scope: { bedrooms, bathrooms, livingRooms, cleanTypeCode: cleanTypeCode as never, addOnCodes },
        addressId,
        scheduledAt,
      });
      setQuote(r.quote);
      setStep('review');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndPay() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createBooking({
        serviceLineCode: detail.code,
        scope: { bedrooms, bathrooms, livingRooms, cleanTypeCode: cleanTypeCode as never, addOnCodes },
        addressId,
        scheduledAt,
        notesForCrew: notes.trim() || undefined,
      });
      setBooking(created.booking);
      const pay = await api.initiatePayment({ bookingId: created.booking.id });
      setPayment(pay.payment);
      setStep('pay');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Poll the payment while it's in flight.
  useEffect(() => {
    if (step !== 'pay' || !payment || PAY_TERMINAL.has(payment.status)) return;
    const id = payment.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const r = await api.getPayment(id);
        if (cancelled) return;
        setPayment(r.payment);
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [step, payment]);

  function toggleAddOn(code: string) {
    setAddOnCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={step} />
      {error ? <div className="mb-4"><Banner>{error}</Banner></div> : null}

      {step === 'service' && (
        <div className="space-y-3">
          {!lines ? (
            <div className="flex justify-center py-16 text-text-muted"><Spinner /></div>
          ) : (
            lines.map((line) => (
              <button key={line.id} onClick={() => chooseService(line)} disabled={busy} className="block w-full text-left">
                <Card className="flex items-center gap-4 transition-colors hover:border-gold">
                  <span className="h-11 w-11 shrink-0 rounded-lg" style={{ backgroundColor: line.colorHex ?? '#C9A55C' }} />
                  <div className="flex-1">
                    <p className="font-medium text-text">{line.name}</p>
                    {line.tagline ? <p className="text-sm text-text-muted">{line.tagline}</p> : null}
                  </div>
                  <span className="text-sm text-text-muted">
                    {line.quoteOnly ? 'Quote →' : line.fromPriceCents != null ? `From ${money(line.fromPriceCents)}` : '→'}
                  </span>
                </Card>
              </button>
            ))
          )}
        </div>
      )}

      {step === 'scope' && detail && (
        <Card className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-text">Clean type</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {detail.cleanTypes.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setCleanTypeCode(ct.code)}
                  className={`rounded-lg border p-3 text-left ${
                    cleanTypeCode === ct.code ? 'border-gold bg-gold-soft/30' : 'border-border'
                  }`}
                >
                  <span className="block font-medium text-text">{ct.name}</span>
                  {ct.subtitle ? <span className="block text-xs text-text-muted">{ct.subtitle}</span> : null}
                  <span className="mt-1 block text-sm text-text-muted">from {money(ct.basePriceCents)}</span>
                </button>
              ))}
            </div>
          </div>

          <Stepper label="Bedrooms" value={bedrooms} setValue={setBedrooms} min={0} />
          <Stepper label="Bathrooms" value={bathrooms} setValue={setBathrooms} min={0} />
          <Stepper label="Living rooms" value={livingRooms} setValue={setLivingRooms} min={0} />

          {detail.addOns.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Add-ons</p>
              <div className="space-y-2">
                {detail.addOns.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                      addOnCodes.includes(a.code) ? 'border-gold bg-gold-soft/30' : 'border-border'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={addOnCodes.includes(a.code)}
                        onChange={() => toggleAddOn(a.code)}
                        className="accent-gold"
                      />
                      <span className="text-text">{a.name}</span>
                    </span>
                    <span className="text-sm text-text-muted">+{money(a.priceCents)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('service')}>← Back</Button>
            <Button onClick={goToSchedule} disabled={busy || !cleanTypeCode}>
              {busy ? <Spinner /> : 'Continue'}
            </Button>
          </div>
        </Card>
      )}

      {step === 'schedule' && (
        <Card className="space-y-6">
          <AddressPicker
            addresses={addresses}
            addressId={addressId}
            setAddressId={setAddressId}
            onCreated={(addr) => {
              setAddresses((prev) => [...prev, addr]);
              setAddressId(addr.id);
            }}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-text">Date</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {nextDays(14).map((d) => (
                <button
                  key={d.iso}
                  onClick={() => pickDate(d.iso)}
                  className={`flex min-w-[64px] flex-col items-center rounded-lg border px-3 py-2 ${
                    date === d.iso ? 'border-gold bg-gold-soft/30' : 'border-border'
                  }`}
                >
                  <span className="text-xs text-text-muted">{d.weekday}</span>
                  <span className="text-lg font-medium text-text">{d.day}</span>
                  <span className="text-xs text-text-muted">{d.month}</span>
                </button>
              ))}
            </div>
          </div>

          {date && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Time</p>
              {!slots ? (
                <div className="flex py-4 text-text-muted"><Spinner /></div>
              ) : slots.filter((s) => s.available).length === 0 ? (
                <p className="text-sm text-text-muted">No slots available on this day.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.filter((s) => s.available).map((s) => (
                    <button
                      key={s.startsAt}
                      onClick={() => setScheduledAt(s.startsAt)}
                      className={`rounded-pill border px-4 py-2 text-sm ${
                        scheduledAt === s.startsAt ? 'border-gold bg-gold-soft/30 text-text' : 'border-border text-text-muted'
                      }`}
                    >
                      {formatTime(s.startsAt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="Notes for the crew">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, pets, parking…" />
          </Field>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('scope')}>← Back</Button>
            <Button onClick={goToReview} disabled={busy || !addressId || !scheduledAt}>
              {busy ? <Spinner /> : 'Review'}
            </Button>
          </div>
        </Card>
      )}

      {step === 'review' && quote && (
        <Card className="space-y-5">
          <h2 className="font-serif text-2xl text-text">Review & confirm</h2>
          <ul className="divide-y divide-border">
            {quote.lineItems.map((li, i) => (
              <li key={i} className="flex justify-between py-2.5 text-sm">
                <span className="text-text-muted">{li.label}</span>
                <span className={li.amountCents < 0 ? 'text-success' : 'text-text'}>{money(li.amountCents)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border pt-3">
            <span className="font-medium text-text">Total</span>
            <span className="font-serif text-xl text-text">{money(quote.totalCents)}</span>
          </div>
          <div className="flex justify-between text-sm text-text-muted">
            <span>Estimated time</span>
            <span>{duration(quote.estimatedDurationMinutes)}</span>
          </div>
          <div className="flex justify-between text-sm text-text-muted">
            <span>Hawk Points earned</span>
            <span className="text-gold-deep">+{quote.pointsToEarn}</span>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('schedule')}>← Back</Button>
            <Button onClick={confirmAndPay} disabled={busy} size="lg">
              {busy ? <Spinner /> : `Pay ${money(quote.totalCents)} with M-Pesa`}
            </Button>
          </div>
        </Card>
      )}

      {step === 'pay' && payment && (
        <PaymentPanel payment={payment} booking={booking} onRetry={confirmAndPay} retrying={busy} />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StepHeader({ step }: { step: Step }) {
  const order: Step[] = ['service', 'scope', 'schedule', 'review', 'pay'];
  const labels: Record<Step, string> = {
    service: 'Service',
    scope: 'Scope',
    schedule: 'Schedule',
    review: 'Review',
    pay: 'Pay',
  };
  const idx = order.indexOf(step);
  return (
    <div className="mb-6">
      <h1 className="font-serif text-3xl text-text">Book a clean</h1>
      <div className="mt-3 flex gap-1.5">
        {order.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-pill ${i <= idx ? 'bg-gold' : 'bg-bg-muted'}`}
            title={labels[s]}
          />
        ))}
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  setValue,
  min = 0,
  max = 12,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setValue(Math.max(min, value - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-pill border border-border-strong text-lg text-text"
        >
          −
        </button>
        <span className="w-6 text-center text-text">{value}</span>
        <button
          type="button"
          onClick={() => setValue(Math.min(max, value + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-pill border border-border-strong text-lg text-text"
        >
          +
        </button>
      </div>
    </div>
  );
}

function AddressPicker({
  addresses,
  addressId,
  setAddressId,
  onCreated,
}: {
  addresses: AddressDto[];
  addressId: string;
  setAddressId: (id: string) => void;
  onCreated: (addr: AddressDto) => void;
}) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!line1.trim()) {
      setError('Enter the street address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.createAddress({
        label: label.trim() || 'Home',
        line1: line1.trim(),
        area: area.trim() || undefined,
        city: city.trim() || undefined,
        isDefault: addresses.length === 0,
      });
      onCreated(r.address);
      setAdding(false);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text">Address</p>
      {addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                addressId === a.id ? 'border-gold bg-gold-soft/30' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="address"
                checked={addressId === a.id}
                onChange={() => setAddressId(a.id)}
                className="accent-gold"
              />
              <span>
                <span className="block text-text">{a.label}</span>
                <span className="block text-sm text-text-muted">
                  {a.line1}
                  {a.area ? `, ${a.area}` : ''} · {a.city}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {adding ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home" />
            </Field>
            <Field label="Area">
              <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Westlands" />
            </Field>
          </div>
          <Field label="Street address">
            <Input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="123 Riverside Dr" />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          {error ? <Banner>{error}</Banner> : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : 'Save address'}
            </Button>
            {addresses.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 text-sm text-gold-deep hover:underline">
          + Add a new address
        </button>
      )}
    </div>
  );
}

function PaymentPanel({
  payment,
  booking,
  onRetry,
  retrying,
}: {
  payment: PaymentDto;
  booking: BookingDto | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (payment.status === 'SUCCEEDED') {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-success/15 text-2xl text-success">
          ✓
        </div>
        <h2 className="font-serif text-2xl text-text">Payment received</h2>
        <p className="text-text-muted">
          Your booking {booking?.reference ? `(${booking.reference})` : ''} is confirmed. A crew will be assigned shortly.
        </p>
        <div className="flex justify-center gap-3">
          {booking ? <ButtonLink href={`/bookings/view?id=${booking.id}`}>View booking</ButtonLink> : null}
          <ButtonLink href="/dashboard" variant="secondary">
            Dashboard
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const failed = ['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(payment.status);
  if (failed) {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-danger/15 text-2xl text-danger">
          !
        </div>
        <h2 className="font-serif text-2xl text-text">Payment didn’t go through</h2>
        <p className="text-text-muted">{payment.failureReason ?? 'The M-Pesa request was not completed.'}</p>
        <div className="flex justify-center gap-3">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? <Spinner /> : 'Try again'}
          </Button>
          {booking ? (
            <ButtonLink href={`/bookings/view?id=${booking.id}`} variant="secondary">
              View booking
            </ButtonLink>
          ) : null}
        </div>
      </Card>
    );
  }

  // In flight
  return (
    <Card className="space-y-4 text-center">
      <div className="mx-auto"><Spinner className="text-gold" /></div>
      <h2 className="font-serif text-2xl text-text">Check your phone</h2>
      <p className="text-text-muted">
        We’ve sent an M-Pesa prompt{payment.msisdn ? ` to ${payment.msisdn}` : ''}. Enter your PIN to confirm
        payment of {money(payment.amountCents)}.
      </p>
      <p className="text-xs text-text-muted">Waiting for confirmation…</p>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function nextDays(count: number): { iso: string; weekday: string; day: string; month: string }[] {
  const out: { iso: string; weekday: string; day: string; month: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
    out.push({
      iso,
      weekday: d.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short' }),
      day: d.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric' }),
      month: d.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', month: 'short' }),
    });
  }
  return out;
}
