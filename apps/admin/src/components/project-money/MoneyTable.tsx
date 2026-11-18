'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { MoneyFiguresDto, PaymentFrequency, ProjectDto, ProjectMoneyTable } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money as formatMoney } from '../../lib/money';

/** Project money shows whole shillings. */
const money = (cents: number) => formatMoney(cents, { whole: true });

/** The same suffixes the project card uses, so the agreed price reads the same in both places. */
const FREQUENCY_SUFFIX: Record<PaymentFrequency, string> = {
  ONE_OFF: '',
  DAILY: '/day',
  WEEKLY: '/week',
  MONTHLY: '/month',
};

const COLS = 'sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]';

/** A profit figure. A loss carries a minus sign and the word, so it never rests on colour alone. */
export function Profit({ cents }: { cents: number }) {
  if (cents < 0) return <span className="text-danger">−{money(-cents)} Loss</span>;
  return <>{money(cents)}</>;
}

export function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 sm:text-right">
      <div className="text-xs font-normal text-charcoal-muted sm:sr-only">{label}</div>
      <div className="break-words tabular-nums">{children}</div>
    </div>
  );
}

function Row({
  name, agreed, figures, onOpen, total,
}: {
  name: ReactNode;
  /** Left out for the lines that are not a project. */
  agreed?: string;
  figures: MoneyFiguresDto | undefined;
  onOpen?: () => void;
  total?: boolean;
}) {
  return (
    <div
      onClick={onOpen}
      className={`grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line px-3 py-3 last:border-b-0 sm:items-baseline sm:px-4 ${COLS} ${
        total ? 'bg-mist font-semibold' : ''
      } ${onOpen ? 'cursor-pointer hover:bg-mist' : ''}`}
    >
      <div className="col-span-2 min-w-0 break-words sm:col-span-1">{name}</div>
      {agreed === undefined ? <div className="hidden sm:block" /> : <Figure label="Agreed price">{agreed}</Figure>}
      <Figure label="Charged">{figures ? money(figures.chargedCents) : '—'}</Figure>
      <Figure label="Spent">{figures ? money(figures.spentCents) : '—'}</Figure>
      <Figure label="Profit">{figures ? <Profit cents={figures.profitCents} /> : '—'}</Figure>
    </div>
  );
}

/**
 * What every project was charged, what it cost and its profit, with the one-off jobs,
 * the jobs not yet sorted and the totals. Mount it only for people who may see project
 * money: it asks the server for the figures as soon as it mounts.
 */
export function MoneyTable({
  projects, isOwner, onOpenProject,
}: {
  /** Every project, in the order the page lists them. */
  projects: Pick<ProjectDto, 'id' | 'title' | 'valueCents' | 'paymentFrequency'>[];
  isOwner: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  const [table, setTable] = useState<ProjectMoneyTable | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setTable(null);
    setFailed(false);
    api
      .projectMoneyTable()
      .then((r) => { if (live) setTable(r.table); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  const figuresById = new Map(table?.projects.map((f) => [f.projectId, f]));
  const unsortedCount = table?.unsorted?.jobCount ?? 0;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Project money</h2>

      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <span className="text-danger">Could not load project money.</span>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist"
          >
            Try again
          </button>
        </div>
      ) : !table ? (
        <div className="rounded-xl border border-line bg-white py-6 text-center text-sm text-charcoal-muted">
          Loading money…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white text-sm text-charcoal">
          <div className={`hidden gap-x-4 border-b border-line px-4 py-2 text-xs text-charcoal-muted sm:grid ${COLS}`}>
            <span>Project</span>
            <span className="text-right">Agreed price</span>
            <span className="text-right">Charged</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Profit</span>
          </div>

          {projects.map((p) => (
            <Row
              key={p.id}
              name={
                <button type="button" className="text-left font-medium text-navy hover:underline">
                  {p.title}
                </button>
              }
              agreed={
                typeof p.valueCents === 'number' ? `${money(p.valueCents)}${FREQUENCY_SUFFIX[p.paymentFrequency]}` : '—'
              }
              figures={figuresById.get(p.id)}
              onOpen={() => onOpenProject(p.id)}
            />
          ))}

          <Row name="One-off jobs" figures={table.oneOff} />

          {table.unsorted && (
            <Row
              name={
                <>
                  Not yet sorted ({unsortedCount} job{unsortedCount === 1 ? '' : 's'})
                  {isOwner && (
                    <span className="mt-0.5 block text-xs text-charcoal-muted">
                      Sort these in Jobs &amp; costs, under Sort jobs.
                    </span>
                  )}
                </>
              }
              figures={table.unsorted}
            />
          )}

          <Row name="Total" figures={table.totals} total />
        </div>
      )}
    </section>
  );
}
