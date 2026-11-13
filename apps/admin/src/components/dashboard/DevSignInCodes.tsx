'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

type OtpRow = { phone: string; email: string | null; purpose: string; codePlain: string; createdAt: string; expiresAt: string };

/**
 * The sign-in codes that are active right now, for development. The server
 * decides whether this exists: it answers 404 when its dev tools are off, and
 * then nothing is drawn and nothing is asked again. The Dashboard mounts it
 * for the owner only, whatever sections the account has.
 */
export function DevSignInCodes() {
  // null until the server answers; false when dev tools are off or it cannot be reached.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [codes, setCodes] = useState<OtpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000),
      );
      const res = await Promise.race([api.recentOtps(), timeout]);
      setCodes(res.codes);
      setLastRefresh(new Date());
    } catch {
      // Timeout, network error, or API unavailable — keep existing codes
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Ask once. Only an answer turns the panel on and starts the polling; a
    // 404 (dev tools off) or an unreachable server leaves it hidden and silent.
    api
      .recentOtps()
      .then((res) => {
        if (cancelled) return;
        setCodes(res.codes);
        setLastRefresh(new Date());
        setLoading(false);
        setEnabled(true);
        intervalRef.current = setInterval(() => void refresh(), 8000);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!enabled) return null;

  return (
    <Card className="mt-12 border-dashed border-border-strong p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs uppercase tracking-widest text-charcoal-muted">Development only</p>
          <h2 className="mt-0.5 font-serif text-lg text-charcoal">Active sign-in codes</h2>
        </div>
        {/* The time is a fact and the button is the action: two things, so
            the time is plain text and only "Refresh" can be pressed. */}
        <div className="flex items-center gap-1.5">
          {lastRefresh && (
            <span className="figure text-xs text-charcoal-muted">Last: {lastRefresh.toLocaleTimeString()}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading} aria-busy={loading}>
            <RotateCw aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && codes.length === 0 && (
        <p className="text-sm text-charcoal-muted">Checking for active codes…</p>
      )}

      {!loading && codes.length === 0 && (
        <p className="text-sm text-charcoal-muted">
          No active codes right now. Request a code from the login page or the mobile app to see it here.
        </p>
      )}

      {codes.length > 0 && (
        <div className="space-y-2">
          {codes.map((row, i) => (
            <OtpRowCard key={i} row={row} />
          ))}
        </div>
      )}
    </Card>
  );
}

function OtpRowCard({ row }: { row: OtpRow }) {
  const [copied, setCopied] = useState(false);
  const expiresIn = Math.max(0, Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 1000 / 60));

  const copy = () => {
    void navigator.clipboard.writeText(row.codePlain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-mist px-4 py-3">
      <div className="min-w-0 flex-1">
        {/* Staff codes go by email, customer codes by SMS — show where each one went. */}
        <p className="truncate text-xs text-charcoal-muted">{row.email ?? row.phone}{row.email ? ' · email' : ' · SMS'}</p>
        <p className="figure mt-0.5 text-2xl tracking-[0.3em] text-charcoal">{row.codePlain}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="figure text-xs text-charcoal-muted">Expires in {expiresIn}m</p>
        <button
          onClick={copy}
          className="mt-1 rounded text-xs font-medium text-navy underline underline-offset-2 hover:no-underline"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
