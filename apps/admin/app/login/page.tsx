'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { session, setSession } = useAuth();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in as admin → go to dashboard.
  useEffect(() => {
    if (session && (session.user.role === 'ADMIN' || session.user.role === 'SUPPORT')) {
      router.replace('/');
    }
  }, [session, router]);

  const e164 = (input: string): string => {
    const digits = input.replace(/\D/g, '');
    if (digits.startsWith('254')) return `+${digits}`;
    if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
    if (digits.length === 9) return `+254${digits}`;
    return `+${digits}`;
  };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestOtp(e164(phone));
      const otp = res.devOtp ?? null;
      setDevOtp(otp);
      if (otp) setCode(otp); // auto-fill in dev
      setStep('code');
    } catch (err) {
      setError(messageFrom(err, 'Could not send the code.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyOtp(e164(phone), code);
      if (res.kind !== 'AUTHENTICATED') {
        setError('No account found for this number. Admins must be provisioned first.');
        return;
      }
      const role = res.session.user.role;
      if (role !== 'ADMIN' && role !== 'SUPPORT') {
        setError('This number is not an admin account.');
        return;
      }
      setSession(res.session);
      router.replace('/');
    } catch (err) {
      setError(messageFrom(err, 'Could not verify the code.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-text-muted text-xs uppercase tracking-[0.2em]">OnyxHawk</p>
        <h1 className="text-4xl mt-2" style={{ fontFamily: 'Georgia, serif' }}>
          Back-office<span className="text-gold-deep italic">.</span>
        </h1>
        <p className="text-text-muted text-sm mt-2">Sign in with your admin phone number.</p>

        {error && (
          <div className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>
        )}

        {step === 'phone' ? (
          <div className="mt-6">
            <label className="text-text-muted text-xs uppercase tracking-widest">Phone</label>
            <div className="mt-2 flex items-center rounded-lg border border-border bg-surface px-4 py-3">
              <span className="text-text-muted mr-2">+254</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="712 480 392"
                inputMode="tel"
                className="flex-1 bg-transparent outline-none text-text"
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              />
            </div>
            <button
              onClick={sendCode}
              disabled={busy || !phone}
              className="mt-4 w-full rounded-lg bg-gold py-3 font-semibold text-surface-dark disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <label className="text-text-muted text-xs uppercase tracking-widest">Verification code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-3 outline-none text-text tracking-[0.3em] text-lg"
              onKeyDown={(e) => e.key === 'Enter' && verify()}
            />
            {devOtp && (
              <div className="mt-3 rounded-lg border border-gold bg-gold-soft/20 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-text-muted">Dev — code auto-filled</p>
                  <p className="font-mono text-2xl tracking-[0.4em] text-gold-deep mt-0.5">{devOtp}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCode(devOtp)}
                  className="text-xs text-text-muted underline"
                >
                  Re-fill
                </button>
              </div>
            )}
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="mt-4 w-full rounded-lg bg-gold py-3 font-semibold text-surface-dark disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button onClick={() => { setStep('phone'); setCode(''); }} className="mt-3 w-full text-text-muted text-sm underline">
              Use a different number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload) {
    return String((err.payload as { error: unknown }).error);
  }
  return fallback;
}
