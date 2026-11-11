'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { CostLineDto, ExpenseCategory, ProjectMoneyDetail, ProjectMoneyJobDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { Figure, Profit, money } from './MoneyTable';

/** The five spending groups, in the order they are shown. */
const GROUP_LABELS: Record<ExpenseCategory, string> = {
  MATERIALS: 'Materials',
  TRANSPORT: 'Transport',
  EMPLOYEE_PAY: 'Crew pay',
  LUNCH: 'Lunch',
  MISCELLANEOUS: 'Other',
};
const GROUPS = Object.keys(GROUP_LABELS) as ExpenseCategory[];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Name column, then charged, spent and profit. One column pair per line at phone width. */
const COLS = 'sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]';
const rowBase = `grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-3 sm:items-baseline sm:px-4 ${COLS}`;
const box = 'overflow-hidden rounded-lg border border-line bg-white text-sm text-charcoal';
const heading = 'mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted';

/** "2026-03" as "March 2026", read from the text so no time zone can move it. */
function monthText(month: string) {
  const [year, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${year}`;
}

function Line({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-line px-3 py-2 last:border-b-0 sm:px-4 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-charcoal-muted'}>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

function ColumnHeadings({ first }: { first: string }) {
  return (
    <div className={`hidden gap-x-4 border-b border-line px-4 py-2 text-xs text-charcoal-muted sm:grid ${COLS}`}>
      <span>{first}</span>
      <span className="text-right">Charged</span>
      <span className="text-right">Spent</span>
      <span className="text-right">Profit</span>
    </div>
  );
}

function CostLine({ cost: c }: { cost: CostLineDto }) {
  return (
    <li className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 break-words">
          <span className="font-medium">{GROUP_LABELS[c.category]}</span>
          {c.description ? ` — ${c.description}` : ''}
        </span>
        <span className="shrink-0 tabular-nums">{money(c.amountCents)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 break-words text-xs text-charcoal-muted">
        <span>{c.date}</span>
        <span>· Entered by {c.enteredByName ?? 'unknown'}</span>
        {!c.receiptRef && !c.receiptUrl && <span>· No receipt</span>}
        {c.receiptRef && <span className="min-w-0">· Receipt: {c.receiptRef}</span>}
        {c.receiptUrl && (
          <span>
            ·{' '}
            <a href={c.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">
              Open receipt
            </a>
          </span>
        )}
      </div>
    </li>
  );
}

function JobRow({ job: j, open, onToggle }: { job: ProjectMoneyJobDto; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <div onClick={onToggle} className={`${rowBase} cursor-pointer hover:bg-mist`}>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <button type="button" aria-expanded={open} className="break-words text-left font-medium text-navy hover:underline">
            {open ? '▲' : '▼'} {j.title}
          </button>
          <div className="text-xs text-charcoal-muted">
            {j.date} · {j.costs.length} cost line{j.costs.length === 1 ? '' : 's'}
          </div>
        </div>
        <Figure label="Charged">{money(j.chargedCents)}</Figure>
        <Figure label="Spent">{money(j.spentCents)}</Figure>
        <Figure label="Profit"><Profit cents={j.profitCents} /></Figure>
        {j.discountCents > 0 && (
          <div className="col-span-2 text-xs text-charcoal-muted sm:col-span-4">
            <div>Amount as typed: {money(j.typedCents)}</div>
            <div>Discount: −{money(j.discountCents)}</div>
            <div>Charged after discount: {money(j.chargedCents)}</div>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-line bg-mist/60 px-3 py-1 sm:px-4">
          {j.costs.length === 0 ? (
            <p className="py-2 text-xs text-charcoal-muted">No costs recorded on this job.</p>
          ) : (
            <ul>
              {j.costs.map((c) => <CostLine key={c.id} cost={c} />)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One project's money: totals, the five spending groups, a row per month for a project
 * billed by the day, week or month, then its jobs, each opening to its cost lines.
 * Mount it only for people who may see project money: it asks the server as soon as it mounts.
 */
export function ContractMoney({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<ProjectMoneyDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [openJob, setOpenJob] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setFailed(false);
    api
      .projectMoneyDetail(projectId)
      .then((r) => { if (live) setDetail(r.detail); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [projectId, attempt]);

  if (failed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm">
        <span className="text-danger">Could not load this project&apos;s money.</span>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!detail) return <p className="py-6 text-center text-sm text-charcoal-muted">Loading money…</p>;

  const t = detail.totals;
  const discounted = t.discountCents > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className={heading}>Totals to date</p>
          <div className={box}>
            {discounted && <Line label="Amount as typed">{money(t.typedCents)}</Line>}
            {discounted && <Line label="Discount">−{money(t.discountCents)}</Line>}
            <Line label={discounted ? 'Charged after discount' : 'Charged'}>{money(t.chargedCents)}</Line>
            <Line label="Spent">{money(t.spentCents)}</Line>
            <Line label="Profit" strong><Profit cents={t.profitCents} /></Line>
          </div>
        </div>

        <div>
          <p className={heading}>Spending by group</p>
          <div className={box}>
            {GROUPS.map((g) => (
              <Line key={g} label={GROUP_LABELS[g]}>{money(detail.spentByGroupCents[g] ?? 0)}</Line>
            ))}
          </div>
        </div>
      </div>

      {detail.months.length > 0 && (
        <div>
          <p className={heading}>By month</p>
          <div className={box}>
            <ColumnHeadings first="Month" />
            {detail.months.map((m) => (
              <div key={m.month} className={`${rowBase} border-b border-line last:border-b-0`}>
                <div className="col-span-2 min-w-0 font-medium sm:col-span-1">{monthText(m.month)}</div>
                <Figure label="Charged">{money(m.chargedCents)}</Figure>
                <Figure label="Spent">{money(m.spentCents)}</Figure>
                <Figure label="Profit"><Profit cents={m.profitCents} /></Figure>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className={heading}>Jobs ({detail.jobs.length})</p>
        {detail.jobs.length === 0 ? (
          <p className="rounded-lg border border-line bg-white py-6 text-center text-sm text-charcoal-muted">
            No jobs are under this project yet.
          </p>
        ) : (
          <div className={box}>
            <ColumnHeadings first="Job" />
            <ul>
              {detail.jobs.map((j) => (
                <JobRow
                  key={j.jobId}
                  job={j}
                  open={openJob === j.jobId}
                  onToggle={() => setOpenJob(openJob === j.jobId ? null : j.jobId)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
