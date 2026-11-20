'use client';

/**
 * Under a project's money: the machines it uses (with the days each works per
 * visit, which an invoice's payment fills in), and how its profit splits: 5%
 * for marketing, the rest by stake, beside what each shareholder paid in
 * towards its costs. The owner's rules of 20 November 2026.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ProjectMachinesDto, ProjectSplitDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { dayLabel, daysOf, halfDaysOf } from '../../lib/invoices';
import { money as formatMoney } from '../../lib/money';
import { nairobiToday } from '../../lib/projectSchedule';
import { useConfirm } from '../ui/confirm-dialog';
import { refusalMessage } from '../project-money/PlacementPicker';

const money = (cents: number) => formatMoney(cents, { whole: true });
const pct = (basisPoints: number) => `${(basisPoints / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}%`;

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist disabled:opacity-50';
const box = 'overflow-hidden rounded-lg border border-line bg-white text-sm text-charcoal';
const heading = 'mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted';

export function ProjectSplit({ projectId, canRecordPayIn }: { projectId: string; canRecordPayIn: boolean }) {
  return (
    <div className="mt-6 space-y-6">
      <SplitSection projectId={projectId} canRecordPayIn={canRecordPayIn} />
      <MachinesSection projectId={projectId} />
    </div>
  );
}

// ── Profit split and pay-ins ────────────────────────────────────────────────

function SplitSection({ projectId, canRecordPayIn }: { projectId: string; canRecordPayIn: boolean }) {
  const askConfirm = useConfirm();
  const [split, setSplit] = useState<ProjectSplitDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ shillings: '', date: nairobiToday(), note: '' });

  const load = useCallback(async () => {
    try {
      setSplit(await api.projectSplit(projectId));
    } catch (err) {
      setError(refusalMessage(err, 'Could not load how the profit splits.'));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const addPayIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const shillings = Number(form.shillings.replace(/,/g, ''));
    if (!Number.isFinite(shillings) || shillings < 1) {
      setError('Give the amount paid in, in shillings.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createProjectPayIn(projectId, {
        totalCents: Math.round(shillings * 100),
        date: form.date,
        note: form.note.trim() || null,
      });
      setForm({ shillings: '', date: nairobiToday(), note: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(refusalMessage(err, 'Could not record the pay-in.'));
    } finally {
      setBusy(false);
    }
  };

  const removePayIn = async (payInId: string, totalCents: number) => {
    const ok = await askConfirm({
      title: `Remove the pay-in of ${money(totalCents)}?`,
      description: "Each shareholder's part of it comes off their investments too.",
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProjectPayIn(projectId, payInId);
      await load();
    } catch (err) {
      setError(refusalMessage(err, 'Could not remove the pay-in.'));
    } finally {
      setBusy(false);
    }
  };

  if (!split) {
    return error ? <p role="alert" className="text-sm text-danger">{error}</p> : <p className="text-sm text-charcoal-muted">Loading the split…</p>;
  }

  return (
    <section>
      <h3 className={heading}>How the profit splits</h3>
      <div className={box}>
        <SplitLine label="Profit so far">{money(split.profitCents)}</SplitLine>
        <SplitLine label="Marketing (5% of the profit)">{money(split.marketingCents)}</SplitLine>
        <SplitLine label="Shared by stake" strong>{money(split.sharedCents)}</SplitLine>
      </div>
      <p className="mt-2 text-xs text-charcoal-muted">
        Profit sharing takes the 5% off each month and splits the rest by stake. A loss sets nothing aside. What the
        shareholders paid in towards this project&apos;s costs stays in the company as their investment.
      </p>

      {split.holders.length > 0 && (
        <div className={`${box} mt-3`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-charcoal-muted">
                <th scope="col" className="px-3 py-2 text-left font-normal sm:px-4">Shareholder</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Stake</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Paid in</th>
                <th scope="col" className="px-3 py-2 text-right font-normal sm:pr-4">Profit share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {split.holders.map((h) => (
                <tr key={h.shareholderId}>
                  <th scope="row" className="px-3 py-2 text-left font-medium sm:px-4">{h.name}</th>
                  <td className="px-3 py-2 text-right tabular-nums text-charcoal-muted">{h.basisPoints ? pct(h.basisPoints) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(h.paidInCents)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums sm:pr-4 ${h.profitShareCents < 0 ? 'text-danger' : ''}`}>{money(h.profitShareCents)}</td>
                </tr>
              ))}
              {split.unallocatedCents !== 0 && (
                <tr>
                  <th scope="row" className="px-3 py-2 text-left font-normal italic text-charcoal-muted sm:px-4">Kept by the company (stakes under 100%)</th>
                  <td />
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums text-charcoal-muted sm:pr-4">{money(split.unallocatedCents)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-charcoal-muted">Profit share is this project&apos;s profit so far at today&apos;s stakes.</p>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className={heading}>Costs paid in by the shareholders</h3>
        {canRecordPayIn && (
          <button type="button" className={btnGhost} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Record a pay-in'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={addPayIn} className="mb-3 grid gap-3 rounded-lg border border-line bg-mist/40 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`payin-amount-${projectId}`}>Total paid in (KSh)</label>
            <input id={`payin-amount-${projectId}`} required inputMode="decimal" className={input} value={form.shillings}
              onChange={(e) => setForm((f) => ({ ...f, shillings: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`payin-date-${projectId}`}>Paid in on</label>
            <input id={`payin-date-${projectId}`} required type="date" max={nairobiToday()} className={input} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted" htmlFor={`payin-note-${projectId}`}>What it was for (optional)</label>
            <input id={`payin-note-${projectId}`} className={input} value={form.note} placeholder="e.g. chemicals and transport"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <button type="submit" className={btn} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <p className="text-xs text-charcoal-muted sm:col-span-4">
            The total is split by each shareholder&apos;s stake today and recorded as their investment. It is not paid
            back; they receive their profit share. Enter the costs themselves in Jobs &amp; costs as usual.
          </p>
        </form>
      )}

      {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}

      {split.payIns.length === 0 ? (
        <p className="text-sm text-charcoal-muted">Nothing paid in yet.</p>
      ) : (
        <ul className={`${box} divide-y divide-line`}>
          {split.payIns.map((p) => (
            <li key={p.id} className="px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span>
                  <span className="font-medium">{money(p.totalCents)}</span>
                  <span className="ml-2 text-xs text-charcoal-muted">{dayLabel(p.date)}{p.note ? ` · ${p.note}` : ''}</span>
                </span>
                {canRecordPayIn && (
                  <button type="button" className="text-xs text-danger hover:underline disabled:opacity-50" disabled={busy}
                    onClick={() => void removePayIn(p.id, p.totalCents)}>Remove</button>
                )}
              </div>
              <p className="mt-0.5 text-xs text-charcoal-muted">
                {p.shares.map((s) => `${s.shareholderName} ${money(s.amountCents)}`).join(' · ')}
                {p.companyCents > 0 ? ` · company ${money(p.companyCents)}` : ''}
              </p>
            </li>
          ))}
          <li className="flex items-baseline justify-between px-3 py-2 font-semibold sm:px-4">
            <span>Total paid in</span>
            <span className="tabular-nums">{money(split.paidInCents)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

function SplitLine({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-line px-3 py-2 last:border-b-0 sm:px-4 ${strong ? 'font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-charcoal-muted'}>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

// ── Machines the project uses ───────────────────────────────────────────────

type MachineRow = { assetId: string; name: string; projectRateCents: number; retired: boolean; days: string };

function rowsOf(data: ProjectMachinesDto): MachineRow[] {
  return data.machines.map((m) => ({
    assetId: m.assetId, name: m.name, projectRateCents: m.projectRateCents, retired: m.retired, days: daysOf(m.halfDaysPerVisit),
  }));
}

function MachinesSection({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectMachinesDto | null>(null);
  const [rows, setRows] = useState<MachineRow[]>([]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = useCallback((d: ProjectMachinesDto) => {
    setData(d);
    setRows(rowsOf(d));
    setAdding('');
  }, []);

  useEffect(() => {
    api.projectMachines(projectId).then(show).catch((err) => setError(refusalMessage(err, 'Could not load the machines.')));
  }, [projectId, show]);

  if (!data) {
    return error ? <p role="alert" className="text-sm text-danger">{error}</p> : null;
  }

  const dirty = JSON.stringify(rows) !== JSON.stringify(rowsOf(data));
  const offered = data.available.filter((a) => !rows.some((r) => r.assetId === a.assetId));

  const save = async () => {
    const machines: { assetId: string; halfDaysPerVisit: number }[] = [];
    for (const r of rows) {
      const halfDays = halfDaysOf(r.days);
      if (halfDays === null || halfDays < 1) {
        setError(`Give ${r.name} at least half a day per visit, as a whole or half number such as 1 or 0.5.`);
        return;
      }
      machines.push({ assetId: r.assetId, halfDaysPerVisit: halfDays });
    }
    setBusy(true);
    setError(null);
    try {
      show(await api.setProjectMachines(projectId, { machines }));
    } catch (err) {
      setError(refusalMessage(err, 'Could not save the machines.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className={heading}>Machines on this project</h3>
      <p className="mb-2 text-xs text-charcoal-muted">
        When an invoice&apos;s payment is recorded, each machine&apos;s days are filled in from the visits marked done in
        that period, at the machine&apos;s project rate. They can be changed before saving.
      </p>
      {rows.length === 0 ? (
        <p className="mb-2 text-sm text-charcoal-muted">No machines listed.</p>
      ) : (
        <ul className={`${box} mb-2 divide-y divide-line`}>
          {rows.map((r) => (
            <li key={r.assetId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4">
              <span className="min-w-0">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-charcoal-muted">
                  {r.retired ? 'retired: no new days' : `${money(r.projectRateCents)} a day`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <input aria-label={`Days per visit for ${r.name}`} className={`${input} w-20 text-right`} inputMode="decimal" value={r.days}
                  onChange={(e) => setRows((prev) => prev.map((x) => (x.assetId === r.assetId ? { ...x, days: e.target.value } : x)))} />
                <span className="text-xs text-charcoal-muted">days a visit</span>
                <button type="button" aria-label={`Take ${r.name} off this project`} className="px-1 text-charcoal-muted hover:text-danger"
                  onClick={() => setRows((prev) => prev.filter((x) => x.assetId !== r.assetId))}>×</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {offered.length > 0 && (
          <>
            <select aria-label="Machine to add" className={`${input} w-auto`} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add a machine…</option>
              {offered.map((a) => <option key={a.assetId} value={a.assetId}>{a.name}</option>)}
            </select>
            <button type="button" className={btnGhost} disabled={!adding}
              onClick={() => {
                const a = offered.find((x) => x.assetId === adding);
                if (!a) return;
                setRows((prev) => [...prev, { assetId: a.assetId, name: a.name, projectRateCents: a.projectRateCents, retired: false, days: '1' }]);
                setAdding('');
              }}>Add</button>
          </>
        )}
        {dirty && <button type="button" className={btn} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save machines'}</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
