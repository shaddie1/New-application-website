'use client';

import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  MachineDetailDto, MachineInvestorDto, MachineLineDto, MachinePaymentDto, MachineRepairDto,
} from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatPercentShort } from '../ownership/stakes';
import { formatDay } from '../ownership/wording';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Button } from '../ui/button';
import { useConfirm, type ConfirmOptions } from '../ui/confirm-dialog';
import { Dialog, DialogContent } from '../ui/dialog';
import { HireForm } from './HireForm';
import { InvestorsForm } from './InvestorsForm';
import { EditDaysForm, LogDaysForm } from './LogDaysForm';
import { EditMachineForm } from './MachineForm';
import { Figure, HEADINGS, LoadFailed, NAME_CELL, Pot, ROW, RetiredMark } from './MachineTable';
import { PayoutForm } from './PayoutForm';
import { RepairForm } from './RepairForm';
import {
  companyPartLine, daysText, earnBackLine, entitledText, hireChargeText, hireLabel, ownedBy, priceText,
  removeHireMessage, stillOwedText,
} from './wording';

/** The owner's form that is open over the machine's view. */
type OwnerForm =
  | { kind: 'machine' | 'investors' | 'repair' | 'days' | 'hire' }
  | { kind: 'edit-days' | 'edit-hire'; line: MachineLineDto }
  | { kind: 'pay'; investor: MachineInvestorDto };

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
export function MachineDetail({ machineId, onBack, canEdit }: MachineDetailProps) {
  // Every route that changes a machine answers with this same shape, so a
  // change can be shown by putting the answer here.
  const [machine, setMachine] = useState<MachineDetailDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The owner's controls. None of this is used on a viewer's page.
  const askConfirm = useConfirm();
  // The form stays set after its dialog closes, so it keeps its place while the dialog fades out.
  const [form, setForm] = useState<OwnerForm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Counts the openings: each one mounts its form afresh, from the machine as it is now.
  const [opening, setOpening] = useState(0);
  // A change made straight from the view, behind a confirmation: one at a time.
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [refusal, setRefusal] = useState<string | null>(null);

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

  const openForm = (next: OwnerForm) => {
    setRefusal(null);
    setForm(next);
    setOpening((n) => n + 1);
    setFormOpen(true);
  };

  /**
   * Asks first, then sends. `send` answers with the machine's fresh detail,
   * or with nothing when the machine itself is gone. A refusal is shown in
   * the server's words.
   */
  const change = async (question: ConfirmOptions, send: () => Promise<MachineDetailDto | null>, fallback: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await askConfirm(question))) return;
      setWorking(true);
      setRefusal(null);
      try {
        const fresh = await send();
        if (fresh) setMachine(fresh);
        else onBack();
      } catch (err) {
        setRefusal(refusalMessage(err, fallback));
      }
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

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

  // ── The owner's changes that need no form: each asks first ────────────────

  const retire = () => change(
    {
      title: `Retire ${m.name}?`,
      description: 'A retired machine keeps its history and takes no new days or hires. You can bring it back at any time.',
      confirmLabel: 'Retire',
    },
    async () => (await api.editMachine(m.id, { condition: 'RETIRED' })).machine,
    'Could not retire the machine. Try again.',
  );

  const bringBack = () => change(
    { title: `Bring ${m.name} back?`, description: 'It can take days and hires again.', confirmLabel: 'Bring back' },
    // Its condition before it was retired is not kept, so it comes back as the asset list's usual one.
    async () => (await api.editMachine(m.id, { condition: 'GOOD' })).machine,
    'Could not bring the machine back. Try again.',
  );

  const deleteMachine = () => change(
    {
      title: `Delete ${m.name}?`,
      description:
        'It leaves the Machines page and the asset list, and this cannot be undone. ' +
        'A machine with days, a hire or a payment cannot be deleted: retire it instead.',
      confirmLabel: 'Delete',
      destructive: true,
    },
    async () => { await api.deleteMachine(m.id); return null; },
    'Could not delete the machine. Try again.',
  );

  const removeDays = (l: MachineLineDto) => change(
    {
      title: `Remove ${daysText(l.halfDays)} on “${l.jobTitle}”?`,
      description: `${money(l.amountCents)} goes back into that job’s profit and leaves the pot.`,
      confirmLabel: 'Remove',
      destructive: true,
    },
    async () => (await api.deleteMachineDays(l.id)).machine,
    'Could not remove the days. Try again.',
  );

  const removeHire = (l: MachineLineDto) => change(
    {
      title: l.customerName ? `Remove the hire to ${l.customerName}?` : 'Remove this hire?',
      // The message lists any other machine with days on the hire's job, one to a line.
      description: <span className="whitespace-pre-line">{removeHireMessage(l)}</span>,
      confirmLabel: 'Remove hire',
      destructive: true,
    },
    async () => (await api.deleteMachineHire(l.id)).machine,
    'Could not remove the hire. Try again.',
  );

  const deleteRepair = (r: MachineRepairDto) => change(
    {
      title: 'Delete this repair?',
      description: `“${r.description}”, ${money(r.costCents)} on ${formatDay(r.date)}. That amount goes back into the pot.`,
      confirmLabel: 'Delete',
      destructive: true,
    },
    async () => (await api.deleteMachineRepair(m.id, r.id)).machine,
    'Could not delete the repair. Try again.',
  );

  const deletePayment = (p: MachinePaymentDto) => change(
    {
      title: 'Delete this payment?',
      description:
        `${money(p.amountCents)} to ${investorNames.get(p.investorId) ?? 'an investor'} on ${formatDay(p.date)}. ` +
        'It will count as not paid: the amount goes back into the pot and is owed again.' +
        (m.payments.length === 1 ? ' With no payment left, the price, investors and start day can be changed again.' : ''),
      confirmLabel: 'Delete',
      destructive: true,
    },
    async () => (await api.deleteMachinePayout(p.id)).machine,
    'Could not delete the payment. Try again.',
  );

  const small = { variant: 'outline', size: 'sm', disabled: working } as const;
  const ownerNote = 'text-xs text-charcoal-muted';
  const closeForm = () => setFormOpen(false);

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
          {canEdit && (
            <div className={rowActions}>
              <Button {...small} onClick={() => openForm({ kind: 'machine' })}>Edit</Button>
              {m.retiredAt ? (
                <Button {...small} onClick={() => void bringBack()}>Bring back</Button>
              ) : (
                <Button {...small} onClick={() => void retire()}>Retire</Button>
              )}
              <Button {...small} className="text-danger" onClick={() => void deleteMachine()}>Delete</Button>
            </div>
          )}
        </div>
      </div>

      {/* It stays in view while the page scrolls: the control that was refused may be far down the view. */}
      {refusal && (
        <div
          role="alert"
          className="sticky top-2 z-10 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-white px-4 py-3 text-sm text-danger shadow-sm"
        >
          <span className="min-w-0 break-words">{refusal}</span>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRefusal(null)}>Dismiss</Button>
        </div>
      )}

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

      <Section
        title={`Investors (${m.investors.length})`}
        action={canEdit && (
          // Investors are fixed once one of them has been paid, and a machine with no price has none.
          m.payments.length > 0 ? (
            <span className={ownerNote}>Fixed while a payment is recorded. Delete the payments to change them.</span>
          ) : m.priceCents <= 0 ? (
            <span className={ownerNote}>Give the machine a price to name investors.</span>
          ) : (
            <Button {...small} onClick={() => openForm({ kind: 'investors' })}>
              {m.investors.length === 0 ? 'Name investors' : 'Edit investors'}
            </Button>
          )
        )}
      >
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
              {m.investors.map((i) => (
                <InvestorRow
                  key={i.id}
                  investor={i}
                  // Only someone who is owed something can be paid.
                  actions={canEdit && i.owedCents > 0 && (
                    <Button {...small} onClick={() => openForm({ kind: 'pay', investor: i })}>
                      Pay<span className="sr-only"> {i.name}</span>
                    </Button>
                  )}
                />
              ))}
            </ul>
            {companyLine && (
              <p className="border-t border-line bg-mist px-3 py-2 text-xs text-charcoal-muted sm:px-4">{companyLine}</p>
            )}
          </div>
        )}
      </Section>

      <Section
        title={`Days and hires (${m.lines.length})`}
        action={canEdit && (
          // A retired machine takes no new days or hires. What it already has can still be corrected.
          m.retiredAt ? (
            <span className={ownerNote}>A retired machine takes no new days or hires.</span>
          ) : (
            <div className={rowActions}>
              <Button {...small} onClick={() => openForm({ kind: 'days' })}>Log days</Button>
              <Button {...small} onClick={() => openForm({ kind: 'hire' })}>Log a hire</Button>
            </div>
          )
        )}
      >
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
              {m.lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  actions={canEdit && (l.isHire ? (
                    <>
                      <Button {...small} onClick={() => openForm({ kind: 'edit-hire', line: l })}>Edit hire</Button>
                      <Button {...small} onClick={() => void removeHire(l)}>Remove hire</Button>
                    </>
                  ) : (
                    <>
                      <Button {...small} onClick={() => openForm({ kind: 'edit-days', line: l })}>
                        Edit days<span className="sr-only"> on {l.jobTitle}</span>
                      </Button>
                      <Button {...small} onClick={() => void removeDays(l)}>
                        Remove<span className="sr-only"> the days on {l.jobTitle}</span>
                      </Button>
                    </>
                  ))}
                />
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title={`Repairs (${m.repairs.length})`}
        action={canEdit && <Button {...small} onClick={() => openForm({ kind: 'repair' })}>Add a repair</Button>}
      >
        {m.repairs.length === 0 ? (
          <p className={empty}>No repairs since {formatDay(m.startDay)}.</p>
        ) : (
          <ul className={box}>
            {m.repairs.map((r) => (
              <RepairRow
                key={r.id}
                repair={r}
                actions={canEdit && (
                  <Button {...small} onClick={() => void deleteRepair(r)}>
                    Delete<span className="sr-only"> the repair “{r.description}”</span>
                  </Button>
                )}
              />
            ))}
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
              {m.payments.map((p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  investorName={investorNames.get(p.investorId)}
                  actions={canEdit && (
                    <Button {...small} onClick={() => void deletePayment(p)}>
                      Delete<span className="sr-only"> the payment of {money(p.amountCents)}</span>
                    </Button>
                  )}
                />
              ))}
            </ul>
          )}
        </Section>
      )}

      {canEdit && (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            {form?.kind === 'machine' && <EditMachineForm key={opening} machine={m} onSaved={setMachine} onClose={closeForm} />}
            {form?.kind === 'investors' && <InvestorsForm key={opening} machine={m} onSaved={setMachine} onClose={closeForm} />}
            {form?.kind === 'repair' && <RepairForm key={opening} machine={m} onSaved={setMachine} onClose={closeForm} />}
            {form?.kind === 'days' && <LogDaysForm key={opening} machine={m} onSaved={setMachine} onClose={closeForm} />}
            {form?.kind === 'edit-days' && (
              <EditDaysForm key={opening} machine={m} line={form.line} onSaved={setMachine} onClose={closeForm} />
            )}
            {form?.kind === 'hire' && <HireForm key={opening} machine={m} onSaved={setMachine} onClose={closeForm} />}
            {form?.kind === 'edit-hire' && (
              <HireForm key={opening} machine={m} line={form.line} onSaved={setMachine} onClose={closeForm} />
            )}
            {form?.kind === 'pay' && (
              <PayoutForm key={opening} machine={m} investor={form.investor} onSaved={setMachine} onClose={closeForm} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
