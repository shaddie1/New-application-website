'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { MyShares, PublicWebsiteJobDto, ShareholderDto } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { GrowthSection, ServiceBreakdown, SharesSection } from '../../../src/components/MySharesSections';
import { MySharesPhotos } from '../../../src/components/MySharesPhotos';
import {
  LONG_PERIODS,
  longPeriodOption,
  monthName,
  nairobiTime,
  periodView,
  resolvePeriod,
  shownMonths,
  stakePercent,
  type PeriodKey,
} from '../../../src/components/MySharesPeriod';

/**
 * One shareholder's page: their stake, share of profit, money put in and
 * payouts, beside the company's growth, service illustrations and photos of
 * published jobs. The owner may open every holder's page; anyone else sees
 * their own. Download PDF prints this page, which is the monthly report.
 *
 * One payload covers every period, so picking a period or a month's bar only
 * changes what is shown; only switching holder refetches, and the period is
 * kept across that switch.
 */

type Load =
  | { state: 'loading' }
  | { state: 'notLinked' }
  | { state: 'failed'; message: string }
  | { state: 'noHolders' } // an owner whose shareholder list is empty
  | { state: 'ready'; data: MyShares };

const field = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-auto';
const card = 'rounded-xl border border-line bg-white px-5 py-16 text-center text-sm text-charcoal-muted';

function describeFailure(err: unknown): Load {
  if (err instanceof ApiError) {
    const code = (err.payload as { code?: unknown } | null)?.code;
    if (err.status === 403 && code === 'NOT_SHAREHOLDER') return { state: 'notLinked' };
    if (err.status === 404) return { state: 'failed', message: 'That shareholder is no longer on the list.' };
    return { state: 'failed', message: `Could not load the shareholder page (${err.status}).` };
  }
  return { state: 'failed', message: 'Could not load the shareholder page.' };
}

export default function MySharesPage() {
  const session = useRequireAdmin();
  const userId = session?.user.id;
  const isOwner = session?.user.isOwner === true;

  // Null asks the server for its default: the caller's own holding, else (an owner) the first holder.
  const [holderId, setHolderId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [picked, setPicked] = useState<PeriodKey | null>(null);
  const [holders, setHolders] = useState<ShareholderDto[] | null>(null);
  const [jobs, setJobs] = useState<PublicWebsiteJobDto[] | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const titleBeforePrint = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    setLoad({ state: 'loading' });
    api
      .myShares(holderId ?? undefined)
      .then((result) => {
        if (current) setLoad(result.holder === null ? { state: 'noHolders' } : { state: 'ready', data: result });
      })
      .catch((err: unknown) => {
        if (current) setLoad(describeFailure(err));
      });
    return () => {
      current = false;
    };
  }, [userId, holderId, attempt]);

  // The owner's holder picker. Without it the owner still sees the default holder.
  useEffect(() => {
    if (!isOwner) return;
    let current = true;
    api
      .shareholders()
      .then((r) => {
        if (current) setHolders(r.shareholders);
      })
      .catch(() => {
        /* no picker */
      });
    return () => {
      current = false;
    };
  }, [isOwner]);

  // Published jobs for the photo strip, apart from the payload: if this fails
  // or is slow, only the strip is missing.
  useEffect(() => {
    if (!userId) return;
    let current = true;
    api
      .publishedWebsiteJobs()
      .then((r) => {
        if (current) setJobs(r.jobs);
      })
      .catch(() => {
        /* no strip */
      });
    return () => {
      current = false;
    };
  }, [userId]);

  const data = load.state === 'ready' ? load.data : null;
  const periodKey = data ? resolvePeriod(data, picked) : null;
  const view = data && periodKey ? periodView(data, periodKey) : null;
  const printTitle = data && view ? `OnyxHawk shares – ${data.holder.name} – ${view.title}` : null;

  /** Stamp the saved time and name the file for its holder and period. */
  const prepareForPrint = useCallback(() => {
    if (!printTitle) return;
    // Rendered before the print dialog lays the page out, not after.
    flushSync(() => setSavedAt(new Date()));
    if (titleBeforePrint.current === null) titleBeforePrint.current = document.title;
    document.title = printTitle;
  }, [printTitle]);

  // Also covers printing from the browser's own menu or Ctrl+P.
  useEffect(() => {
    const restoreTitle = () => {
      if (titleBeforePrint.current !== null) document.title = titleBeforePrint.current;
      titleBeforePrint.current = null;
    };
    window.addEventListener('beforeprint', prepareForPrint);
    window.addEventListener('afterprint', restoreTitle);
    return () => {
      window.removeEventListener('beforeprint', prepareForPrint);
      window.removeEventListener('afterprint', restoreTitle);
      restoreTitle();
    };
  }, [prepareForPrint]);

  const downloadPdf = () => {
    prepareForPrint();
    window.print();
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  if (load.state === 'notLinked') {
    return (
      <div>
        <h1 className="font-serif mb-6 text-3xl">
          My shares
        </h1>
        <div className="max-w-prose rounded-xl border border-line bg-white p-6 text-sm text-charcoal">
          <p className="font-medium">Your account is not on the shareholder list.</p>
          <p className="mt-2 text-charcoal-muted">
            There is no shareholder page for this account. If you hold shares in OnyxHawk, ask the founder to link
            your account to your holding.
          </p>
        </div>
      </div>
    );
  }

  const holder = data?.holder;
  const pickerValue = holderId ?? holder?.id;
  const showPicker = isOwner && !!holders && holders.length > 0 && !!pickerValue;

  return (
    <div>
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {holder && <p className="mb-1 text-sm text-charcoal-muted">Shareholder report</p>}
          <h1 className="font-serif text-3xl text-charcoal">
            {holder ? holder.name : isOwner ? 'Shareholder pages' : 'My shares'}
          </h1>
          {holder && (
            <p className="mt-1 text-sm text-charcoal-muted">
              {[
                holder.title,
                holder.kind === 'COMPANY' ? 'Company holding' : null,
                `${stakePercent(holder.basisPoints)} stake`,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {data && view && (
            <>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-lg font-medium text-charcoal">
                {view.title}
                {view.inProgress && (
                  <span className="rounded-pill bg-aqua-soft px-2 py-0.5 text-xs font-medium text-aqua-deep">
                    In progress
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-charcoal-muted">
                Figures as of {nairobiTime(data.asOf)}
                <span className="hidden print:inline"> · Saved {savedAt ? nairobiTime(savedAt) : ''}</span>
              </p>
            </>
          )}
        </div>

        {load.state !== 'noHolders' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
            {showPicker && (
              <label className="block">
                <span className="mb-1 block text-xs text-charcoal-muted">Shareholder</span>
                <select className={field} value={pickerValue} onChange={(e) => setHolderId(e.target.value)}>
                  {holders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.name}${s.kind === 'COMPANY' ? ' (company holding)' : ''}, ${stakePercent(s.basisPoints)}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data && periodKey && (
              <label className="block">
                <span className="mb-1 block text-xs text-charcoal-muted">Period</span>
                <select className={field} value={periodKey} onChange={(e) => setPicked(e.target.value)}>
                  <optgroup label="Months">
                    {[...shownMonths(data)].reverse().map((m) => (
                      <option key={m.key} value={m.key}>
                        {`${monthName(m.key, 'long')}${m.inProgress ? ' (in progress)' : ''}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Longer periods">
                    {LONG_PERIODS.map((k) => (
                      <option key={k} value={k}>
                        {longPeriodOption(data, k)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            )}
            <div>
              <button
                type="button"
                onClick={downloadPdf}
                disabled={!data}
                className="w-full rounded-lg bg-navy px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Download PDF
              </button>
              <p className="mt-1 text-xs text-charcoal-muted">In the print window, choose &ldquo;Save as PDF&rdquo;.</p>
            </div>
          </div>
        )}
      </header>

      {load.state === 'loading' && <div className={card}>Loading…</div>}

      {load.state === 'failed' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{load.message}</span>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm hover:bg-danger/10"
          >
            Try again
          </button>
        </div>
      )}

      {load.state === 'noHolders' && (
        <div className="max-w-prose rounded-xl border border-line bg-white p-6 text-sm text-charcoal">
          <p className="font-medium">No shareholders yet.</p>
          <p className="mt-2 text-charcoal-muted">
            Add the holders on the{' '}
            <Link href="/equity" className="text-aqua-deep underline underline-offset-2">
              Ownership
            </Link>{' '}
            page, and link each one to their staff account. Their pages then open here.
          </p>
        </div>
      )}

      {data && view && (
        <div className="space-y-12">
          <SharesSection data={data} view={view} />
          <div className="space-y-4">
            <GrowthSection data={data} view={view} onSelectMonth={setPicked} />
            <ServiceBreakdown view={view} />
          </div>
          <MySharesPhotos jobs={jobs} view={view} />
        </div>
      )}
    </div>
  );
}
