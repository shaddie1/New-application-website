'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QuoteFrequency, ServiceLineCode, ServiceLineDto } from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';
import { Banner, Button, ButtonLink, Card, Field, Input, Select, Spinner, Textarea } from '../../../src/components/ui';

const FREQUENCIES: { value: QuoteFrequency; label: string }[] = [
  { value: 'NONE', label: 'One-off' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks' },
  { value: 'MONTHLY', label: 'Monthly' },
];

export default function QuotePage() {
  const { session } = useAuth();
  const [lines, setLines] = useState<ServiceLineDto[]>([]);
  const [serviceLineCode, setServiceLineCode] = useState<ServiceLineCode | ''>('');
  const [siteType, setSiteType] = useState('');
  const [approxSqm, setApproxSqm] = useState('');
  const [floors, setFloors] = useState('');
  const [frequency, setFrequency] = useState<QuoteFrequency>('NONE');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getServiceLines().then((r) => {
      setLines(r.serviceLines);
      const firstQuoteOnly = r.serviceLines.find((l) => l.quoteOnly) ?? r.serviceLines[0];
      if (firstQuoteOnly) setServiceLineCode(firstQuoteOnly.code);
    }).catch(() => undefined);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceLineCode || !siteType.trim()) {
      setError('Please choose a service and describe the site.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createQuoteRequest({
        serviceLineCode,
        siteType: siteType.trim(),
        approxSqm: approxSqm ? Number(approxSqm) : undefined,
        floors: floors ? Number(floors) : undefined,
        frequency,
        notes: notes.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Not signed in → invite to sign in (quote requests are tied to an account).
  if (session === null) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-serif text-3xl text-text">Get a custom quote</h1>
        <p className="mt-3 text-text-muted">
          Sign in with your phone number to request a quote — we’ll save it to your account and reply there.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/sign-in" size="lg">
            Sign in to continue
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="flex justify-center py-32 text-text-muted">
        <Spinner />
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-serif text-3xl text-text">Quote request sent</h1>
        <p className="mt-3 text-text-muted">
          Thanks! Our team will review the details and get back to you with a quote shortly.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/dashboard" size="lg">
            Go to dashboard
          </ButtonLink>
          <Button variant="secondary" size="lg" onClick={() => setDone(false)}>
            Request another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-serif text-4xl text-text">Get a quote</h1>
      <p className="mt-3 text-text-muted">
        Tell us about your site and we’ll prepare a tailored quote.
      </p>

      <Card className="mt-8">
        <form onSubmit={submit} className="space-y-5">
          <Field label="Service">
            <Select value={serviceLineCode} onChange={(e) => setServiceLineCode(e.target.value as ServiceLineCode)}>
              <option value="" disabled>
                Choose a service
              </option>
              {lines.map((l) => (
                <option key={l.id} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Site type" hint="e.g. “Open-plan office · 4 floors” or “3-storey clinic”">
            <Input value={siteType} onChange={(e) => setSiteType(e.target.value)} placeholder="Describe the space" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Approx. size (sqm)">
              <Input
                type="number"
                min={0}
                value={approxSqm}
                onChange={(e) => setApproxSqm(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Floors">
              <Input
                type="number"
                min={0}
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="Frequency">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as QuoteFrequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else we should know?"
            />
          </Field>

          {error ? <Banner>{error}</Banner> : null}

          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting ? <Spinner /> : 'Send quote request'}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-text-muted">
        Looking for a standard clean instead?{' '}
        <Link href="/book" className="text-gold-deep hover:underline">
          Book directly
        </Link>
        .
      </p>
    </div>
  );
}
