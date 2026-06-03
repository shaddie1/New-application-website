'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, apiErrorMessage } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { Brand } from '../../src/components/Brand';
import { Banner, Button, Card, Field, Input, Spinner } from '../../src/components/ui';

type Step = 'phone' | 'code' | 'register';

/** Normalise Kenyan numbers to E.164 (+2547…). Leaves other inputs as typed. */
function normalizePhone(raw: string): string {
  const t = raw.trim().replace(/\s+/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('0')) return `+254${t.slice(1)}`;
  if (t.startsWith('254')) return `+${t}`;
  if (/^\d{9}$/.test(t)) return `+254${t}`;
  return t;
}

export default function SignInPage() {
  const router = useRouter();
  const { session, setSession } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → straight to the app.
  useEffect(() => {
    if (session && session.user.role !== 'ADMIN' && session.user.role !== 'SUPPORT') {
      router.replace('/dashboard');
    }
  }, [session, router]);

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) {
      setError('Enter a valid phone number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestOtp(normalized);
      setPhone(normalized);
      setDevOtp(res.devOtp ?? null);
      if (res.devOtp) setCode(res.devOtp);
      setStep('code');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the code.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(phone, code.trim());
      if (res.kind === 'AUTHENTICATED') {
        setSession(res.session);
        router.replace('/dashboard');
      } else {
        setRegistrationToken(res.registrationToken);
        setStep('register');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'That code didn’t work.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({
        registrationToken,
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      setSession(res.session);
      router.replace('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-5 py-12">
      <Brand />
      <Card className="mt-8 w-full max-w-sm">
        {step === 'phone' && (
          <form onSubmit={submitPhone} className="space-y-5">
            <div>
              <h1 className="font-serif text-2xl text-text">Sign in or sign up</h1>
              <p className="mt-1 text-sm text-text-muted">We’ll text you a one-time code.</p>
            </div>
            <Field label="Phone number" hint="Kenyan numbers: 07… or +2547…">
              <Input
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 712 345 678"
              />
            </Field>
            {error ? <Banner>{error}</Banner> : null}
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? <Spinner /> : 'Send code'}
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode} className="space-y-5">
            <div>
              <h1 className="font-serif text-2xl text-text">Enter your code</h1>
              <p className="mt-1 text-sm text-text-muted">Sent to {phone}.</p>
            </div>
            {devOtp ? <Banner tone="info">Dev code: {devOtp}</Banner> : null}
            <Field label="6-digit code">
              <Input
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••"
                className="tracking-[0.4em]"
              />
            </Field>
            {error ? <Banner>{error}</Banner> : null}
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? <Spinner /> : 'Verify'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
              className="w-full text-center text-sm text-text-muted hover:text-text"
            >
              Use a different number
            </button>
          </form>
        )}

        {step === 'register' && (
          <form onSubmit={submitRegister} className="space-y-5">
            <div>
              <h1 className="font-serif text-2xl text-text">Create your account</h1>
              <p className="mt-1 text-sm text-text-muted">Just a couple of details to finish up.</p>
            </div>
            <Field label="Full name">
              <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Aluoch" />
            </Field>
            <Field label="Email" hint="Optional — for receipts">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Referral code" hint="Optional">
              <Input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="ABC123" />
            </Field>
            {error ? <Banner>{error}</Banner> : null}
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? <Spinner /> : 'Create account'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
