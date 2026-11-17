'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { MachineRegisterDto, MachineRowDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { earnBackLine, ownedBy, potText, priceText } from './wording';

/**
 * One row of a list on the Machines page. Up to 1279 px it is folded: the name
 * takes a line of its own and the figures sit under it, two to a line on a
 * phone and three from 640 px, each with its label. From 1280 px, add the
 * list's own `xl:grid-cols-…` and the figures become columns under headings.
 * The page's widest list has six figures, which need that much room.
 */
export const ROW = 'grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-3 sm:grid-cols-3 sm:px-4 xl:items-baseline';
/** The first cell of a row: a line of its own while folded, the first column from 1280 px. */
export const NAME_CELL = 'col-span-full min-w-0 xl:col-span-1';
/** The line of column headings, shown only once the rows are columns. */
export const HEADINGS = 'hidden items-end gap-x-4 border-b border-line px-4 py-2 text-xs text-charcoal-muted xl:grid';

const COLS = 'xl:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))]';

/** A figure in a row. Its label shows while the row is folded and is left to screen readers once it has a heading. */
export function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 xl:text-right">
      <div className="text-xs font-normal text-charcoal-muted xl:sr-only">{label}</div>
      <div className="break-words tabular-nums">{children}</div>
    </div>
  );
}

/** What is in a pot. A pot below zero says "Short by", so it never rests on colour alone. */
export function Pot({ cents }: { cents: number }) {
  if (cents < 0) return <span className="text-danger">{potText(cents)}</span>;
  return <>{potText(cents)}</>;
}

/** Beside the name of a machine that is retired: it keeps its history and takes no new days or hires. */
export function RetiredMark() {
  return (
    <span className="ml-2 inline-block rounded-full border border-line px-2 py-0.5 align-middle text-xs font-normal text-charcoal-muted">
      Retired
    </span>
  );
}

/** Shown in place of figures that could not be loaded. Never a zero. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
      <span className="text-danger">Could not load {what}.</span>
      <button type="button" onClick={onRetry} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist">
        Try again
      </button>
    </div>
  );
}

function MachineRow({ machine: m, onOpen }: { machine: MachineRowDto; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className={`${ROW} ${COLS} cursor-pointer border-b border-line hover:bg-mist`}>
      <div className={NAME_CELL}>
        <button type="button" className="break-words text-left font-medium text-navy hover:underline">
          {m.name}
        </button>
        {m.retiredAt && <RetiredMark />}
        <div className="break-words text-xs text-charcoal-muted">Owned by: {ownedBy(m)}</div>
      </div>
      <Figure label="Price">{priceText(m.priceCents)}</Figure>
      <Figure label="Daily rate">{money(m.dailyRateCents)}</Figure>
      <Figure label="Earned">{money(m.earnedCents)}</Figure>
      <Figure label="Repairs">{money(m.repairsCents)}</Figure>
      <Figure label="Paid to investors">{money(m.paidOutCents)}</Figure>
      <Figure label="In the pot now"><Pot cents={m.potCents} /></Figure>
      <div className="col-span-full break-words text-xs text-charcoal-muted">{earnBackLine(m)}</div>
    </div>
  );
}

/**
 * Every machine on the register with its figures, and the totals. Mount it only
 * for people who may see the register: it asks the server as soon as it mounts.
 * It asks again each time it is mounted, so coming back from a machine shows
 * what was changed there.
 */
export function MachineTable({
  onOpen, emptyAction,
}: {
  onOpen: (machineId: string) => void;
  /** Shown under "No machines yet": the owner's control for adding the first one. */
  emptyAction?: ReactNode;
}) {
  const [register, setRegister] = useState<MachineRegisterDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setRegister(null);
    setFailed(false);
    api
      .machineRegister()
      .then((r) => { if (live) setRegister(r.register); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  if (failed) return <LoadFailed what="the machines" onRetry={() => setAttempt((a) => a + 1)} />;
  if (!register) {
    return (
      <div className="rounded-xl border border-line bg-white py-6 text-center text-sm text-charcoal-muted">
        Loading machines…
      </div>
    );
  }
  if (register.machines.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-charcoal-muted">
        <p>No machines yet</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  const t = register.totals;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white text-sm text-charcoal">
      <div className={`${HEADINGS} ${COLS}`}>
        <span>Machine</span>
        <span className="text-right">Price</span>
        <span className="text-right">Daily rate</span>
        <span className="text-right">Earned</span>
        <span className="text-right">Repairs</span>
        <span className="text-right">Paid to investors</span>
        <span className="text-right">In the pot now</span>
      </div>

      {register.machines.map((m) => (
        <MachineRow key={m.id} machine={m} onOpen={() => onOpen(m.id)} />
      ))}

      <div className={`${ROW} ${COLS} bg-mist font-semibold`}>
        <div className={NAME_CELL}>Total</div>
        <Figure label="Price">{priceText(t.priceCents)}</Figure>
        {/* Daily rates do not add up. The cell keeps the columns in step. */}
        <div className="hidden xl:block" />
        <Figure label="Earned">{money(t.earnedCents)}</Figure>
        <Figure label="Repairs">{money(t.repairsCents)}</Figure>
        <Figure label="Paid to investors">{money(t.paidOutCents)}</Figure>
        <Figure label="In the pot now"><Pot cents={t.potCents} /></Figure>
      </div>
    </div>
  );
}
