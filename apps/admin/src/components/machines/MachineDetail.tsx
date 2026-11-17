'use client';

import { ChevronLeft } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  MachineDetailDto, MachineInvestorDto, MachineLineDto, MachinePaymentDto, MachineRepairDto,
} from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatPercentShort } from '../ownership/stakes';
import { formatDay } from '../ownership/wording';
import { Button } from '../ui/button';
import { Figure, HEADINGS, LoadFailed, NAME_CELL, Pot, ROW, RetiredMark } from './MachineTable';
import {
  companyPartLine, daysText, earnBackLine, entitledText, hireChargeText, hireLabel, ownedBy, priceText, stillOwedText,
} from './wording';

const LINE_COLS = 'xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]';
const INVESTOR_COLS = 'xl:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]';
const box = 'overflow-hidden rounded-lg border border-line bg-white text-sm text-charcoal';
const empty = 'rounded-lg border border-line bg-white px-4 py-6 text-center text-sm text-charcoal-muted';
const listRow = 'border-b border-line px-3 py-2 last:border-b-0 sm:px-4';
const rowNote = 'mt-0.5 flex flex-wrap gap-x-2 break-words text-xs text-charcoal-muted';
const rowActions = 'flex flex-wrap gap-2';

/**
 * A titled part of the machine's view. `action` sits beside the title: the
 * place for the control that adds to that part.
 */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-charcoal-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Line({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-line px-3 py-2 last:border-b-0 sm:px-4 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-charcoal-muted'}>{label}</span>
      <span className="min-w-0 break-words text-right tabular-nums">{children}</span>
    </div>
  );
}

// Each row below takes `actions`: the controls for that one entry, drawn under it.

/** Days on a job, or a hire. A viewer's copy of a hire carries no customer name, so none is shown. */
function LineRow({ line: l, actions }: { line: MachineLineDto; actions?: ReactNode }) {
  const hire = l.isHire ? hireLabel(l) : null;
  const charge = hireChargeText(l);
  return (
    <li className={`${ROW} ${LINE_COLS} border-b border-line last:border-b-0`}>
      <div className={NAME_CELL}>
        <div className="break-words font-medium">{l.jobTitle}</div>
        <div className={rowNote}>
          <span>{formatDay(l.date)}</span>
          {/* For a viewer the title of a hire is already "Hire". */}
          {hire && hire !== l.jobTitle && <span>· {hire}</span>}
          {charge && <span>· {charge}</span>}
        </div>
      </div>
      <Figure label="Days">{daysText(l.halfDays)}</Figure>
      <Figure label="Daily rate">{money(l.rateCents)}</Figure>
      <Figure label="Amount">{money(l.amountCents)}</Figure>
      {actions && <div className={`col-span-full ${rowActions}`}>{actions}</div>}
    </li>
  );
}

function RepairRow({ repair: r, actions }: { repair: MachineRepairDto; actions?: ReactNode }) {
  return (
    <li className={listRow}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 break-words font-medium">{r.description}</span>
        <span className="shrink-0 tabular-nums">{money(r.costCents)}</span>
      </div>
      <div className={rowNote}>
        <span>{formatDay(r.date)}</span>
        {r.performedBy && <span className="min-w-0">· By {r.performedBy}</span>}
        {r.receiptRef ? <span className="min-w-0">· Receipt: {r.receiptRef}</span> : <span>· No receipt</span>}
      </div>
      {actions && <div className={`mt-2 ${rowActions}`}>{actions}</div>}
    </li>
  );
}

function InvestorRow({ investor: i, actions }: { investor: MachineInvestorDto; actions?: ReactNode }) {
  return (
    <li className={`${ROW} ${INVESTOR_COLS} border-b border-line last:border-b-0`}>
      <div className={`${NAME_CELL} break-words font-medium`}>{i.name}</div>
      <Figure label="Put in">{money(i.contributionCents)}</Figure>
      <Figure label="Share">{formatPercentShort(i.shareBps)}</Figure>
      <Figure label="Entitled">{entitledText(i.entitledCents)}</Figure>
      <Figure label="Paid">{money(i.paidCents)}</Figure>
      <Figure label="Still owed">
        {/* "Overpaid by" is in the words, so the colour is not what says it. */}
        {i.overpaidCents > 0 ? <span className="text-danger">{stillOwedText(i)}</span> : stillOwedText(i)}
      </Figure>
      {actions && <div className={`col-span-full ${rowActions}`}>{actions}</div>}
    </li>
  );
}

function PaymentRow({
  payment: p, investorName, actions,
}: {
  payment: MachinePaymentDto;
  /** Undefined when the payment's investor is not among the machine's. */
  investorName: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <li className={listRow}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 break-words font-medium">{investorName ?? '—'}</span>
        <span className="shrink-0 tabular-nums">{money(p.amountCents)}</span>
      </div>
      <div className={rowNote}>
        <span>{formatDay(p.date)}</span>
        {p.reference ? <span className="min-w-0">· Reference: {p.reference}</span> : <span>· No reference</span>}
      </div>
      {actions && <div className={`mt-2 ${rowActions}`}>{actions}</div>}
    </li>
  );
}

export type MachineDetailProps = {
  /** A machine's id is its asset's id. */
  machineId: string;
  /** Back to the table of every machine. */
  onBack: () => void;
  /**
   * The owner only, from the server's access answer. Everyone sees the same
   * figures; this says whether the owner's controls belong on the view.
   */
  canEdit: boolean;
};

/**
 * One machine: its pot, who owns it, the days and hires it has earned from,
 * its repairs and the payments to its investors. Mount it only for people who
 * may see the register: it asks the server as soon as it mounts.
 */
export function MachineDetail({ machineId, onBack }: MachineDetailProps) {
  // Every route that changes a machine answers with this same shape, so a
  // change can be shown by putting the answer here.
  const [machine, setMachine] = useState<MachineDetailDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setMachine(null);
    setFailed(false);
    api
      .machine(machineId)
      .then((r) => { if (live) setMachine(r.machine); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [machineId, attempt]);

  const back = (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3">
      <ChevronLeft aria-hidden="true" /> All machines
    </Button>
  );

  if (failed) {
    return (
      <div className="space-y-4">
        {back}
        <LoadFailed what="this machine" onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }
  if (!machine) {
    return (
      <div className="space-y-4">
        {back}
        <p className="py-6 text-center text-sm text-charcoal-muted">Loading machine…</p>
      </div>
    );
  }

  const m = machine;
  const investorNames = new Map(m.investors.map((i) => [i.id, i.name]));
  const companyLine = companyPartLine(m);

  return (
    <div className="space-y-6">
      <div>
        {back}
        {/* The name on the left; the controls for the machine itself go on the right. */}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words font-serif text-2xl text-charcoal">
              {m.name}
              {m.retiredAt && <RetiredMark />}
            </h2>
            <p className="mt-1 break-words text-sm text-charcoal-muted">Owned by: {ownedBy(m)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
        <Section title="The pot">
          <div className={box}>
            <Line label="Earned">{money(m.earnedCents)}</Line>
            <Line label="Repairs">{money(m.repairsCents)}</Line>
            <Line label="Paid to investors">{money(m.paidOutCents)}</Line>
            <Line label="In the pot now" strong><Pot cents={m.potCents} /></Line>
          </div>
        </Section>

        <Section title="The machine">
          <div className={box}>
            <Line label="Price">{priceText(m.priceCents)}</Line>
            <Line label="Daily rate">{money(m.dailyRateCents)}</Line>
            <Line label="Counts from">{formatDay(m.startDay)}</Line>
            <Line label="Against its price and repairs">{earnBackLine(m)}</Line>
          </div>
        </Section>
      </div>

      <Section title={`Investors (${m.investors.length})`}>
        {m.investors.length === 0 ? (
          <p className={empty}>The company owns this machine. What it earns stays in its pot.</p>
        ) : (
          <div className={box}>
            <div className={`${HEADINGS} ${INVESTOR_COLS}`}>
              <span>Investor</span>
              <span className="text-right">Put in</span>
              <span className="text-right">Share</span>
              <span className="text-right">Entitled</span>
              <span className="text-right">Paid</span>
              <span className="text-right">Still owed</span>
            </div>
            <ul>
              {m.investors.map((i) => <InvestorRow key={i.id} investor={i} />)}
            </ul>
            {companyLine && (
              <p className="border-t border-line bg-mist px-3 py-2 text-xs text-charcoal-muted sm:px-4">{companyLine}</p>
            )}
          </div>
        )}
      </Section>

      <Section title={`Days and hires (${m.lines.length})`}>
        {m.lines.length === 0 ? (
          <p className={empty}>No days or hires logged yet.</p>
        ) : (
          <div className={box}>
            <div className={`${HEADINGS} ${LINE_COLS}`}>
              <span>Job or hire</span>
              <span className="text-right">Days</span>
              <span className="text-right">Daily rate</span>
              <span className="text-right">Amount</span>
            </div>
            <ul>
              {m.lines.map((l) => <LineRow key={l.id} line={l} />)}
            </ul>
          </div>
        )}
      </Section>

      <Section title={`Repairs (${m.repairs.length})`}>
        {m.repairs.length === 0 ? (
          <p className={empty}>No repairs since {formatDay(m.startDay)}.</p>
        ) : (
          <ul className={box}>
            {m.repairs.map((r) => <RepairRow key={r.id} repair={r} />)}
          </ul>
        )}
      </Section>

      {/* A machine the company owns alone has nobody to pay. */}
      {(m.investors.length > 0 || m.payments.length > 0) && (
        <Section title={`Payments to investors (${m.payments.length})`}>
          {m.payments.length === 0 ? (
            <p className={empty}>No payments to investors yet.</p>
          ) : (
            <ul className={box}>
              {m.payments.map((p) => <PaymentRow key={p.id} payment={p} investorName={investorNames.get(p.investorId)} />)}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
