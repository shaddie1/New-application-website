'use client';

import { useState } from 'react';
import type { RequestEmailChangeResult } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { clearSession } from '../../../src/lib/session';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  SUPPORT: 'Support',
  FINANCIAL_MANAGER: 'Financial Manager',
  MARKETING: 'Marketing Personnel',
  CLEANING_SUPERVISOR: 'Cleaning Supervisor',
  SHAREHOLDER: 'Shareholder',
};

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-text outline-none focus:border-aqua';
const btn = 'rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

export default function ProfilePage() {
  const session = useRequireAdmin();

  // Changing the sign-in email: enter the new address, then the code(s) it sends.
  const [step, setStep] = useState<'idle' | 'enter' | 'confirm'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState<RequestEmailChangeResult | null>(null);
  const [newCode, setNewCode] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  const { user } = session;
  const roleLabel = user.isPrimaryOwner ? 'Primary owner' : user.isOwner ? 'Owner' : (ROLE_LABELS[user.role] ?? user.role);

  function reset() {
    setStep('idle');
    setNewEmail('');
    setSent(null);
    setNewCode('');
    setCurrentCode('');
    setError(null);
  }

  async function sendCodes(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestEmailChange(email);
      setSent(res);
      setNewCode(res.devCodes?.newCode ?? '');
      setCurrentCode(res.devCodes?.currentCode ?? '');
      setStep('confirm');
    } catch (err) {
      setError(messageFrom(err, 'Could not send the code.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.confirmEmailChange({ newCode: newCode.trim(), ...(sent?.approvalSentTo && { currentCode: currentCode.trim() }) });
      // The change signed every session out, this one included.
      clearSession();
      window.location.assign('/login?signin=changed');
    } catch (err) {
      setError(messageFrom(err, 'Could not change your email.'));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Profile</h1>
        <p className="text-text-muted text-sm mt-1">Your back-office account.</p>
      </div>

      {error && <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      <section className="rounded-xl border border-border bg-surface p-5">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-text-muted">Name</dt>
          <dd className="text-text">{user.fullName}</dd>
          <dt className="text-text-muted">Role</dt>
          <dd className="text-text">{roleLabel}</dd>
          <dt className="text-text-muted">Phone</dt>
          <dd className="text-text">{user.phone}</dd>
          <dt className="text-text-muted">Sign-in email</dt>
          <dd className="text-text">{user.email ?? '—'}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium text-text">Change sign-in email</p>

        {user.isPrimaryOwner ? (
          <p className="mt-2 text-sm text-text-muted">
            The primary owner’s sign-in email can only be changed by script, run by someone with database access. See “Primary owner” in DEPLOY.md.
          </p>
        ) : step === 'idle' ? (
          <>
            <p className="mt-2 text-sm text-text-muted">
              We’ll send a code to the new address
              {user.isOwner ? ', and one to your current address to approve the change' : ''}. When you confirm, you’re signed
              out everywhere and sign in again with the new address.
            </p>
            <button className={`${btn} mt-4`} onClick={() => setStep('enter')}>Change email</button>
          </>
        ) : step === 'enter' ? (
          <form onSubmit={(e) => void sendCodes(e)} className="mt-4 space-y-3">
            <label className="block text-xs uppercase tracking-widest text-text-muted" htmlFor="new-email">New email</label>
            <input
              id="new-email"
              type="email"
              autoFocus
              className={input}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@onyxhawkcleaningservice.com"
            />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Sending…' : 'Send code'}</button>
              <button type="button" onClick={reset} className="text-sm text-text-muted underline">Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void confirm(e)} className="mt-4 space-y-3">
            <label className="block text-xs uppercase tracking-widest text-text-muted" htmlFor="new-code">
              Code sent to {sent?.sentTo}
            </label>
            <input
              id="new-code"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              className={`${input} tracking-[0.3em] text-lg`}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))}
            />
            {sent?.approvalSentTo && (
              <>
                <label className="block text-xs uppercase tracking-widest text-text-muted" htmlFor="current-code">
                  Approval code sent to your current email, {sent.approvalSentTo}
                </label>
                <input
                  id="current-code"
                  inputMode="numeric"
                  maxLength={6}
                  className={`${input} tracking-[0.3em] text-lg`}
                  value={currentCode}
                  onChange={(e) => setCurrentCode(e.target.value.replace(/\D/g, ''))}
                />
              </>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Confirming…' : 'Confirm and sign out'}</button>
              <button type="button" onClick={() => { setStep('enter'); setError(null); }} className="text-sm text-text-muted underline">
                Send new codes
              </button>
              <button type="button" onClick={reset} className="text-sm text-text-muted underline">Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload) {
    return String((err.payload as { error: unknown }).error);
  }
  return fallback;
}
