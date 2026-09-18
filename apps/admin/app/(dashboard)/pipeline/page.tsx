'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CalculatorChannel,
  CreateLeadInput,
  CreateTenderInput,
  FunnelActualsDto,
  FunnelTargets,
  LeadChannel,
  LeadDto,
  LeadEventDto,
  LeadSegment,
  LeadStage,
  RequiredActivityResult,
  TenderDto,
  TenderEventDto,
  TenderKind,
  TenderStatus,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { csvMoney, downloadCsv } from '../../../src/lib/csv';
import { canEditTargets, canMarkCommission, canViewPipeline, householdOnly } from '../../../src/lib/roles';

// ── Labels ───────────────────────────────────────────────────────────────────

const SEGMENT_LABEL: Record<LeadSegment, string> = {
  HOUSEHOLD: 'Household', COMMERCIAL: 'Commercial', MEDICAL: 'Medical', DEVELOPER: 'Developer', NGO: 'NGO', PUBLIC_SECTOR: 'Public sector',
};
const CHANNEL_LABEL: Record<LeadChannel, string> = {
  DIRECT_OUTREACH: 'Direct outreach', WARM_INTRO: 'Warm intro', HOUSEHOLD_ENQUIRY: 'Household enquiry', REFERRAL: 'Referral', OTHER: 'Other',
};
const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New', CONVERSATION: 'Conversation', SITE_VISIT: 'Site visit', PROPOSAL_SENT: 'Proposal sent', WON: 'Won', LOST: 'Lost',
};
const STAGES = Object.keys(STAGE_LABEL) as LeadStage[];
/** The live funnel, in order. Won and Lost sit outside it. */
const PIPELINE: LeadStage[] = ['NEW', 'CONVERSATION', 'SITE_VISIT', 'PROPOSAL_SENT'];

const TENDER_KIND_LABEL: Record<TenderKind, string> = { PUBLIC_TENDER: 'Public tender', PRIVATE_RFQ: 'Private RFQ / EOI / NGO' };
const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  IDENTIFIED: 'Identified', PREPARING: 'Preparing', PACK_WITH_COO: 'Pack with COO', SUBMITTED: 'Submitted',
  AWARDED: 'Awarded', NOT_AWARDED: 'Not awarded', WITHDRAWN: 'Withdrawn',
};
const TENDER_STATUSES = Object.keys(TENDER_STATUS_LABEL) as TenderStatus[];
/** Statuses where the dates still matter. */
const TENDER_OPEN: TenderStatus[] = ['IDENTIFIED', 'PREPARING', 'PACK_WITH_COO'];

const CALC_CHANNELS: { key: CalculatorChannel; label: string }[] = [
  { key: 'DIRECT_OUTREACH', label: 'Direct outreach' },
  { key: 'WARM_INTRO', label: 'Warm introductions' },
  { key: 'PUBLIC_TENDER', label: 'Public tenders' },
  { key: 'PRIVATE_RFQ', label: 'Private RFQ / EOI / NGO' },
  { key: 'HOUSEHOLD', label: 'Household enquiries' },
];

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed';
const tab = (on: boolean) =>
  `border-b-2 px-4 py-2 text-sm ${on ? 'border-gold-deep font-medium text-gold-deep' : 'border-transparent text-charcoal-muted hover:text-charcoal'}`;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function money(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dateOnly(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function pct(fraction: number) {
  return `${Math.round(fraction * 1000) / 10}%`;
}
function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}
function thisMonth() {
  return todayIso().slice(0, 7);
}
function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { error?: unknown } | null;
    if (payload && typeof payload.error === 'string') return `${payload.error} (${err.status})`;
    if (payload && typeof payload.error === 'object' && payload.error) {
      const flat = payload.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      const first = flat.formErrors?.[0] ?? Object.entries(flat.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`)[0];
      if (first) return `${first} (${err.status})`;
    }
    return `${fallback} (${err.status})`;
  }
  return fallback;
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'leads' | 'tenders' | 'targets';

export default function PipelinePage() {
  const session = useRequireAdmin();
  const [tabKey, setTab] = useState<Tab>('leads');
  const [error, setError] = useState<string | null>(null);

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  const full = canViewPipeline(session);
  const household = householdOnly(session);
  if (!full && !household) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Pipeline</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-muted">
          Leads, tenders and the funnel targets are visible to the Business Development Lead, the COO, the owner, finance
          and (for household leads) Marketing.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Pipeline</h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          {household
            ? 'Household enquiries and the marketing targets. Every stage move is logged and feeds the funnel actuals.'
            : 'Leads, tenders and the funnel targets. Every stage move is logged and feeds the funnel actuals.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-line">
        <button onClick={() => setTab('leads')} className={tab(tabKey === 'leads')}>Leads</button>
        {full && <button onClick={() => setTab('tenders')} className={tab(tabKey === 'tenders')}>Tenders</button>}
        <button onClick={() => setTab('targets')} className={tab(tabKey === 'targets')}>Targets &amp; Actuals</button>
      </div>

      {tabKey === 'leads' && <LeadsTab household={household} canPay={canMarkCommission(session)} onError={setError} />}
      {tabKey === 'tenders' && full && <TendersTab onError={setError} />}
      {tabKey === 'targets' && <TargetsTab editable={canEditTargets(session)} household={household} onError={setError} />}
    </div>
  );
}

// ── Leads ────────────────────────────────────────────────────────────────────

type Owner = { id: string; fullName: string; role: string };

function LeadsTab({ household, canPay, onError }: { household: boolean; canPay: boolean; onError: (m: string | null) => void }) {
  const [leads, setLeads] = useState<LeadDto[] | null>(null);
  const [commission, setCommission] = useState({ dueCents: 0, dueCount: 0, paidCents: 0 });
  const [owners, setOwners] = useState<Owner[]>([]);
  const [filters, setFilters] = useState<{ stage: '' | LeadStage; segment: '' | LeadSegment; channel: '' | LeadChannel; bdOwnerId: string }>({
    stage: '', segment: '', channel: '', bdOwnerId: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.leads({ segment: filters.segment, channel: filters.channel, bdOwnerId: filters.bdOwnerId });
      setLeads(res.leads);
      setCommission(res.commission);
    } catch (err) {
      onError(messageFrom(err, 'Could not load leads'));
    }
  }, [filters.segment, filters.channel, filters.bdOwnerId, onError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.pipelineOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([])); }, []);

  const patch = (updated: LeadDto) => setLeads((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? null);

  const shown = (leads ?? []).filter((l) => !filters.stage || l.stage === filters.stage);
  const counts = STAGES.reduce((acc, s) => ({ ...acc, [s]: (leads ?? []).filter((l) => l.stage === s).length }), {} as Record<LeadStage, number>);
  const won = (leads ?? []).filter((l) => l.stage === 'WON' && (l.commissionCents ?? 0) > 0);

  const exportCommission = () =>
    downloadCsv('lead-commission', [
      { header: 'Won on', value: (l: LeadDto) => (l.wonAt ? l.wonAt.slice(0, 10) : '') },
      { header: 'Organisation', value: (l) => l.organisation ?? '' },
      { header: 'Contact', value: (l) => l.contactName },
      { header: 'BD owner', value: (l) => l.bdOwnerName ?? '' },
      { header: 'Revenue received (KSh)', value: (l) => csvMoney(l.revenueReceivedCents ?? 0) },
      { header: 'Direct costs (KSh)', value: (l) => csvMoney(l.actualDirectCostsCents ?? 0) },
      { header: 'Net profit (KSh)', value: (l) => csvMoney(l.netProfitCents ?? 0) },
      { header: 'Commission %', value: (l) => (l.commissionPct != null ? (l.commissionPct * 100).toFixed(1) : '') },
      { header: 'Commission (KSh)', value: (l) => csvMoney(l.commissionCents ?? 0) },
      { header: 'Status', value: (l) => (l.commissionPaidAt ? 'Paid' : 'Due') },
      { header: 'Paid at', value: (l) => (l.commissionPaidAt ? l.commissionPaidAt.slice(0, 10) : '') },
      { header: 'Reference', value: (l) => l.commissionReference ?? '' },
    ], won);

  return (
    <div>
      {/* Commission due — the payout queue, same shape as Profit sharing. */}
      {!household && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-charcoal-muted">Total commission due</p>
              <p className="mt-1 text-2xl" style={{ fontFamily: 'Georgia, serif' }}>{money(commission.dueCents)}</p>
              <p className="text-xs text-charcoal-muted">{commission.dueCount} won lead{commission.dueCount === 1 ? '' : 's'} unpaid · {money(commission.paidCents)} paid to date</p>
            </div>
          </div>
          <button className={btnGhost} onClick={exportCommission} disabled={won.length === 0}>Export commission CSV</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilters((f) => ({ ...f, stage: '' }))} className={chip(filters.stage === '')}>All ({leads?.length ?? 0})</button>
          {STAGES.map((s) => (
            <button key={s} onClick={() => setFilters((f) => ({ ...f, stage: s }))} className={chip(filters.stage === s)}>
              {STAGE_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
        <button className={btn} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New lead'}</button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select className={input} value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value as '' | LeadSegment }))} disabled={household}>
          <option value="">All segments</option>
          {(Object.keys(SEGMENT_LABEL) as LeadSegment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
        </select>
        <select className={input} value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value as '' | LeadChannel }))}>
          <option value="">All channels</option>
          {(Object.keys(CHANNEL_LABEL) as LeadChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
        <select className={input} value={filters.bdOwnerId} onChange={(e) => setFilters((f) => ({ ...f, bdOwnerId: e.target.value }))}>
          <option value="">All BD owners</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </div>

      {showForm && (
        <LeadForm
          owners={owners}
          household={household}
          onCancel={() => setShowForm(false)}
          onSaved={(lead) => { setShowForm(false); setLeads((prev) => [lead, ...(prev ?? [])]); setExpanded(lead.id); }}
          onError={onError}
        />
      )}

      {!leads ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>No leads match. Click <strong>+ New lead</strong> to log one.</Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              owners={owners}
              household={household}
              canPay={canPay}
              expanded={expanded === l.id}
              onToggle={() => setExpanded(expanded === l.id ? null : l.id)}
              onChange={(updated) => { patch(updated); void load(); }}
              onDeleted={() => setLeads((prev) => prev?.filter((x) => x.id !== l.id) ?? null)}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-charcoal bg-charcoal text-white' : 'border-line bg-white text-charcoal-muted'}`;

function LeadForm({ owners, household, initial, onCancel, onSaved, onError }: {
  owners: Owner[];
  household: boolean;
  initial?: LeadDto;
  onCancel: () => void;
  onSaved: (lead: LeadDto) => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState({
    organisation: initial?.organisation ?? '',
    contactName: initial?.contactName ?? '',
    contactPhone: initial?.contactPhone ?? '',
    contactEmail: initial?.contactEmail ?? '',
    segment: (initial?.segment ?? (household ? 'HOUSEHOLD' : 'COMMERCIAL')) as LeadSegment,
    channel: (initial?.channel ?? (household ? 'HOUSEHOLD_ENQUIRY' : 'DIRECT_OUTREACH')) as LeadChannel,
    bdOwnerId: initial?.bdOwnerId ?? '',
    siteLocation: initial?.siteLocation ?? '',
    valueKes: initial?.estimatedValueCents != null ? String(initial.estimatedValueCents / 100) : '',
    isRecurring: initial?.isRecurring ?? false,
    traineeSourced: initial?.traineeSourced ?? false,
    nextActionAt: initial?.nextActionAt ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contactName.trim()) return;
    setSaving(true);
    onError(null);
    const body: CreateLeadInput = {
      organisation: form.organisation.trim() || null,
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      segment: form.segment,
      channel: form.channel,
      bdOwnerId: form.bdOwnerId || null,
      siteLocation: form.siteLocation.trim() || null,
      estimatedValueCents: form.valueKes ? Math.round(parseFloat(form.valueKes) * 100) : null,
      isRecurring: form.isRecurring,
      traineeSourced: form.traineeSourced,
      nextActionAt: form.nextActionAt || null,
      notes: form.notes.trim() || null,
    };
    try {
      const res = initial ? await api.updateLead(initial.id, body) : await api.createLead(body);
      onSaved(res.lead);
    } catch (err) {
      onError(messageFrom(err, initial ? 'Could not save the lead' : 'Could not create the lead'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-gold-bright/40 bg-gold-bright/[0.06] p-5 sm:grid-cols-3">
      <Labelled label="Organisation"><input className={input} value={form.organisation} placeholder="Leave blank for a household" onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))} /></Labelled>
      <Labelled label="Contact name"><input required className={input} value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} /></Labelled>
      <Labelled label="Contact phone"><input className={input} value={form.contactPhone} placeholder="0712 345 678" onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} /></Labelled>
      <Labelled label="Contact email"><input className={input} value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} /></Labelled>
      <Labelled label="Segment">
        <select className={input} value={form.segment} disabled={household} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as LeadSegment }))}>
          {(Object.keys(SEGMENT_LABEL) as LeadSegment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
        </select>
      </Labelled>
      <Labelled label="Channel">
        <select className={input} value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as LeadChannel }))}>
          {(Object.keys(CHANNEL_LABEL) as LeadChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
      </Labelled>
      <Labelled label="BD owner">
        <select className={input} value={form.bdOwnerId} onChange={(e) => setForm((f) => ({ ...f, bdOwnerId: e.target.value }))}>
          <option value="">Unassigned</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </Labelled>
      <Labelled label="Site location"><input className={input} value={form.siteLocation} onChange={(e) => setForm((f) => ({ ...f, siteLocation: e.target.value }))} /></Labelled>
      <Labelled label="Estimated value (KSh)"><input type="number" min={0} className={input} value={form.valueKes} onChange={(e) => setForm((f) => ({ ...f, valueKes: e.target.value }))} /></Labelled>
      <Labelled label="Next action"><input type="date" className={input} value={form.nextActionAt} onChange={(e) => setForm((f) => ({ ...f, nextActionAt: e.target.value }))} /></Labelled>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))} />Recurring contract (not one-off)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.traineeSourced} onChange={(e) => setForm((f) => ({ ...f, traineeSourced: e.target.checked }))} />Trainee-sourced (commission applies)</label>
      <div className="sm:col-span-3"><Labelled label="Notes"><input className={input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Labelled></div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create lead'}</button>
      </div>
    </form>
  );
}

function stageTone(stage: LeadStage) {
  if (stage === 'WON') return 'bg-success/10 text-success';
  if (stage === 'LOST') return 'bg-danger/10 text-danger';
  if (stage === 'PROPOSAL_SENT') return 'bg-gold-bright/20 text-bronze';
  return 'bg-cream-deep text-charcoal-muted';
}

function LeadCard({ lead: l, owners, household, canPay, expanded, onToggle, onChange, onDeleted, onError }: {
  lead: LeadDto;
  owners: Owner[];
  household: boolean;
  canPay: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (l: LeadDto) => void;
  onDeleted: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<'details' | 'log'>('details');
  const [outcome, setOutcome] = useState<'WON' | 'LOST' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const run = async (key: string, optimistic: Partial<LeadDto> | null, call: () => Promise<{ lead: LeadDto }>, fallback: string) => {
    setBusy(key);
    setSaveState('saving');
    onError(null);
    const before = l;
    if (optimistic) onChange({ ...l, ...optimistic });
    try {
      onChange((await call()).lead);
      setSaveState('saved');
      setReloadKey((k) => k + 1);
    } catch (err) {
      onChange(before);
      setSaveState('failed');
      onError(messageFrom(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const moveTo = (stage: LeadStage) => {
    if (stage === l.stage) return;
    if (stage === 'WON' || stage === 'LOST') { setOutcome(stage); return; }
    setOutcome(null);
    void run('stage', { stage }, () => api.changeLeadStage(l.id, { stage }), 'Could not change the stage');
  };

  const createQuote = async () => {
    if (!confirm(`Create a quote request for ${l.organisation ?? l.contactName} and open it in the Quote Builder?`)) return;
    setBusy('quote');
    onError(null);
    try {
      const res = await api.createQuoteFromLead(l.id);
      onChange(res.lead);
      router.push(`/quotes?open=${encodeURIComponent(res.quoteRequestId)}`);
    } catch (err) {
      onError(messageFrom(err, 'Could not create the quote'));
    } finally {
      setBusy(null);
    }
  };

  const markPaid = () => {
    const reference = prompt(`Payment reference for ${money(l.commissionCents ?? 0)} commission (M-Pesa or bank):`);
    if (reference === null) return;
    void run('paid', { commissionPaidAt: new Date().toISOString(), commissionReference: reference.trim() || null },
      () => api.markLeadCommissionPaid(l.id, { reference: reference.trim() || undefined }), 'Could not mark the commission paid');
  };

  const remove = async () => {
    if (!confirm(`Delete the lead for ${l.organisation ?? l.contactName} and its activity log?`)) return;
    try { await api.deleteLead(l.id); onDeleted(); }
    catch (err) { onError(messageFrom(err, 'Could not delete the lead')); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await run('note', null, () => api.addLeadNote(l.id, note.trim()), 'Could not add the note');
    setNote('');
    setPanel('log');
  };

  const idx = PIPELINE.indexOf(l.stage);
  const dueSoon = l.nextActionAt && l.nextActionAt <= todayIso() && l.stage !== 'WON' && l.stage !== 'LOST';

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-charcoal">{l.organisation ?? l.contactName}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${stageTone(l.stage)}`}>{STAGE_LABEL[l.stage]}</span>
            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">{SEGMENT_LABEL[l.segment]}</span>
            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">{CHANNEL_LABEL[l.channel]}</span>
            {l.traineeSourced && <span className="rounded-full bg-gold-bright/20 px-2 py-0.5 text-xs text-bronze">Trainee-sourced</span>}
            {l.isRecurring && <span className="rounded-full bg-gold-bright/20 px-2 py-0.5 text-xs text-bronze">Recurring</span>}
            {l.quoteRequestId && (
              <a href={`/quotes?open=${encodeURIComponent(l.quoteRequestId)}`} className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success hover:underline">
                Quote · {(l.quoteStatus ?? '').toLowerCase().replace(/_/g, ' ')}
              </a>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-charcoal-muted">
            {l.organisation && <span>{l.contactName}</span>}
            {l.contactPhone && <span>· {l.contactPhone}</span>}
            {l.siteLocation && <span>· {l.siteLocation}</span>}
            {l.bdOwnerName && <span>· {l.bdOwnerName}</span>}
            {l.estimatedValueCents != null && <span className="font-medium text-charcoal">· est. {money(l.estimatedValueCents)}</span>}
            {l.nextActionAt && <span className={dueSoon ? 'font-medium text-warning' : ''}>· next action {dateOnly(l.nextActionAt)}</span>}
          </div>
          {l.stage === 'WON' && l.netProfitCents != null && (
            <p className="mt-1 text-xs text-charcoal-muted">
              Won {l.wonAt ? when(l.wonAt) : ''} · revenue {money(l.revenueReceivedCents ?? 0)} − costs {money(l.actualDirectCostsCents ?? 0)} = net{' '}
              <span className={`font-medium ${l.netProfitCents >= 0 ? 'text-success' : 'text-danger'}`}>{money(l.netProfitCents)}</span>
              {(l.commissionCents ?? 0) > 0 && (
                <> · commission <span className="font-medium text-charcoal">{money(l.commissionCents!)}</span>{' '}
                  {l.commissionPaidAt ? <span className="text-success">paid {when(l.commissionPaidAt)}{l.commissionReference ? ` · Ref ${l.commissionReference}` : ''}</span> : <span className="text-warning">due</span>}
                </>
              )}
            </p>
          )}
          {l.stage === 'LOST' && l.lostReason && <p className="mt-1 text-xs text-danger">Lost: {l.lostReason}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`text-xs ${saveState === 'failed' ? 'font-medium text-danger' : saveState === 'saved' ? 'font-medium text-success' : 'text-charcoal-muted'}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved' : ''}
          </span>
          {l.stage === 'PROPOSAL_SENT' && !l.quoteRequestId && (
            <button className={btn} disabled={!!busy} onClick={() => void createQuote()}>{busy === 'quote' ? 'Creating…' : 'Create quote'}</button>
          )}
          {l.stage === 'WON' && (l.commissionCents ?? 0) > 0 && !l.commissionPaidAt && canPay && (
            <button className={btnGhost} disabled={!!busy} onClick={markPaid}>Mark commission paid</button>
          )}
          <select value={l.stage} disabled={!!busy || !!l.commissionPaidAt} onChange={(e) => moveTo(e.target.value as LeadStage)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs">
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <button className={btnGhost} onClick={onToggle}>{expanded ? '▲ Hide' : '▼ Details'}</button>
        </div>
      </div>

      {/* Funnel pills — where the lead sits, at a glance. */}
      <div className="flex flex-wrap gap-1 border-t border-line px-5 py-2">
        {PIPELINE.map((s, here) => (
          <button key={s} onClick={() => moveTo(s)} disabled={!!busy || !!l.commissionPaidAt}
            className={`rounded-full px-2 py-0.5 text-[11px] ${idx > -1 && here <= idx ? 'bg-gold-bright/20 text-bronze' : 'bg-cream-deep text-charcoal-muted hover:bg-gold-bright/10'}`}>
            {STAGE_LABEL[s]}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-charcoal-muted">{l.eventCount} event{l.eventCount === 1 ? '' : 's'}</span>
      </div>

      {outcome && (
        <OutcomeForm
          lead={l}
          outcome={outcome}
          busy={busy === 'stage'}
          onCancel={() => setOutcome(null)}
          onSubmit={(body) => { setOutcome(null); void run('stage', { stage: outcome }, () => api.changeLeadStage(l.id, body), `Could not mark the lead ${outcome.toLowerCase()}`); }}
        />
      )}

      {expanded && (
        <div className="border-t border-line bg-cream/40 px-5 py-4">
          <div className="mb-4 flex items-center gap-1 border-b border-line">
            <button onClick={() => setPanel('details')} className={tab(panel === 'details')}>Details</button>
            <button onClick={() => setPanel('log')} className={tab(panel === 'log')}>Activity log ({l.eventCount})</button>
          </div>

          {panel === 'details' && (editing ? (
            <LeadForm owners={owners} household={household} initial={l} onCancel={() => setEditing(false)}
              onSaved={(updated) => { setEditing(false); onChange(updated); setReloadKey((k) => k + 1); }} onError={onError} />
          ) : (
            <div className="space-y-3">
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Row k="Contact" v={[l.contactName, l.contactPhone, l.contactEmail].filter(Boolean).join(' · ')} />
                <Row k="BD owner" v={l.bdOwnerName ?? '—'} />
                <Row k="Site" v={l.siteLocation ?? '—'} />
                <Row k="Estimated value" v={l.estimatedValueCents != null ? money(l.estimatedValueCents) : '—'} />
                <Row k="Notes" v={l.notes ?? '—'} />
                <Row k="Logged by" v={`${l.createdByName ?? 'unknown'} · ${when(l.createdAt)}`} />
              </dl>
              <div className="flex gap-2 border-t border-line pt-3">
                <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNote(); } }}
                  placeholder="Add a note to the activity log" className={input} />
                <button className={btn} disabled={!!busy || !note.trim()} onClick={() => void addNote()}>Add</button>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                <button className={btnGhost} onClick={() => setEditing(true)}>Edit details</button>
                {!household && <button onClick={() => void remove()} className="text-danger hover:underline">Delete lead</button>}
              </div>
            </div>
          ))}

          {panel === 'log' && <LeadLog leadId={l.id} reloadKey={reloadKey} />}
        </div>
      )}
    </div>
  );
}

/** Won needs the money; Lost needs a reason. Shown inline when either is picked. */
function OutcomeForm({ lead, outcome, busy, onCancel, onSubmit }: {
  lead: LeadDto;
  outcome: 'WON' | 'LOST';
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: Parameters<typeof api.changeLeadStage>[1]) => void;
}) {
  const [revenue, setRevenue] = useState('');
  const [costs, setCosts] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const rev = Math.round((parseFloat(revenue) || 0) * 100);
  const cost = Math.round((parseFloat(costs) || 0) * 100);
  const net = rev - cost;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (outcome === 'WON') {
      if (!revenue || !costs) return;
      if (!confirm(`Mark ${lead.organisation ?? lead.contactName} as won with net profit ${money(net)}?`)) return;
      onSubmit({ stage: 'WON', revenueReceivedCents: rev, actualDirectCostsCents: cost, note: note.trim() || undefined });
    } else {
      if (!reason.trim()) return;
      if (!confirm(`Mark ${lead.organisation ?? lead.contactName} as lost?`)) return;
      onSubmit({ stage: 'LOST', lostReason: reason.trim(), note: note.trim() || undefined });
    }
  };

  return (
    <form onSubmit={submit} className={`grid gap-3 border-t px-5 py-4 sm:grid-cols-4 ${outcome === 'WON' ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'}`}>
      {outcome === 'WON' ? (
        <>
          <Labelled label="Revenue received (KSh)"><input required type="number" min={0} className={input} value={revenue} onChange={(e) => setRevenue(e.target.value)} /></Labelled>
          <Labelled label="Actual direct costs (KSh)"><input required type="number" min={0} className={input} value={costs} onChange={(e) => setCosts(e.target.value)} /></Labelled>
          <div className="text-sm">
            <p className="text-xs text-charcoal-muted">Net profit</p>
            <p className={`mt-2 font-medium ${net >= 0 ? 'text-success' : 'text-danger'}`}>{money(net)}</p>
            <p className="text-xs text-charcoal-muted">{lead.traineeSourced ? 'Commission at the Quote Builder rate' : 'No commission — not trainee-sourced'}</p>
          </div>
        </>
      ) : (
        <div className="sm:col-span-3"><Labelled label="Why was it lost?"><input required className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Labelled></div>
      )}
      <Labelled label="Note (optional)"><input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Labelled>
      <div className="flex justify-end gap-2 sm:col-span-4">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy} className={outcome === 'WON' ? 'rounded-lg bg-success px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50' : 'rounded-lg bg-danger px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50'}>
          {busy ? 'Saving…' : outcome === 'WON' ? 'Mark won' : 'Mark lost'}
        </button>
      </div>
    </form>
  );
}

const EVENT_TONE: Record<string, string> = {
  CREATED: 'var(--chart-accent-deep)',
  STAGE_CHANGED: 'var(--chart-accent)',
  STATUS_CHANGED: 'var(--chart-accent)',
  COMMISSION_PAID: 'var(--chart-positive)',
  QUOTE_LINKED: 'var(--chart-positive)',
  DETAILS_CHANGED: 'var(--chart-muted)',
  NOTE_ADDED: 'var(--chart-muted)',
};

function EventList({ events }: { events: (LeadEventDto | TenderEventDto)[] }) {
  if (events.length === 0) return <p className="py-6 text-center text-sm text-charcoal-muted">Nothing recorded yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-cream" style={{ backgroundColor: EVENT_TONE[e.kind] ?? 'var(--chart-muted)' }} />
          <p className="text-sm text-charcoal">{e.summary}</p>
          {e.detail && <p className="mt-0.5 text-xs text-charcoal-muted">{e.detail}</p>}
          <p className="mt-0.5 text-xs text-charcoal-muted">{e.actorName ?? 'Unknown'} · {when(e.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

function LeadLog({ leadId, reloadKey }: { leadId: string; reloadKey: number }) {
  const [events, setEvents] = useState<LeadEventDto[] | null>(null);
  useEffect(() => {
    let live = true;
    api.leadEvents(leadId).then((r) => { if (live) setEvents(r.events); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [leadId, reloadKey]);
  if (!events) return <p className="py-6 text-center text-sm text-charcoal-muted">Loading history…</p>;
  return <EventList events={events} />;
}

// ── Tenders ──────────────────────────────────────────────────────────────────

/** Countdown chip — red once past, amber within 3 days; neutral once the tender is in. */
function Countdown({ days, date, open, label }: { days: number; date: string; open: boolean; label: string }) {
  if (!open) return <span className="text-xs text-charcoal-muted" title={date}>{dateOnly(date)}</span>;
  const tone = days < 0 ? 'bg-danger/10 text-danger' : days <= 3 ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success';
  const text = days < 0 ? `${label} ${Math.abs(days)}d overdue` : days === 0 ? `${label} today` : `${label} in ${days}d`;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`} title={date}>{text}</span>;
}

function TendersTab({ onError }: { onError: (m: string | null) => void }) {
  const [tenders, setTenders] = useState<TenderDto[] | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTenders((await api.tenders()).tenders); }
    catch (err) { onError(messageFrom(err, 'Could not load tenders')); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.pipelineOwners().then((r) => setOwners(r.owners)).catch(() => setOwners([])); }, []);

  const patch = (t: TenderDto) => setTenders((prev) => prev?.map((x) => (x.id === t.id ? t : x)) ?? null);
  const dueSoon = (tenders ?? []).filter((t) => TENDER_OPEN.includes(t.status) && (t.daysToPack <= 5 || t.daysToDeadline <= 5));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-charcoal-muted">{tenders?.length ?? 0} tender{tenders?.length === 1 ? '' : 's'} · {(tenders ?? []).filter((t) => TENDER_OPEN.includes(t.status)).length} in preparation</span>
        <button className={btn} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New tender'}</button>
      </div>

      {dueSoon.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">{dueSoon.length} tender{dueSoon.length === 1 ? '' : 's'} due within 5 days</span>
          <span className="text-charcoal-muted"> — {dueSoon.map((t) => `${t.title} (${t.daysToPack < 0 ? 'pack overdue' : `pack in ${t.daysToPack}d`}, deadline in ${t.daysToDeadline}d)`).join(', ')}</span>
        </div>
      )}

      {showForm && (
        <TenderForm owners={owners} onCancel={() => setShowForm(false)}
          onSaved={(t) => { setShowForm(false); setTenders((prev) => [t, ...(prev ?? [])].sort((a, b) => a.submissionDeadline.localeCompare(b.submissionDeadline))); setExpanded(t.id); }}
          onError={onError} />
      )}

      {!tenders ? <Empty>Loading…</Empty> : tenders.length === 0 ? (
        <Empty>No tenders logged. Click <strong>+ New tender</strong> when one is identified.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/60 text-left text-xs uppercase tracking-widest text-charcoal-muted">
                <th className="px-4 py-3 font-normal">Tender</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Pack to COO</th>
                <th className="px-4 py-3 font-normal">Submission</th>
                <th className="px-4 py-3 text-right font-normal">Value</th>
                <th className="px-4 py-3 font-normal">Owner</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenders.map((t) => (
                <TenderRow key={t.id} tender={t} owners={owners} expanded={expanded === t.id}
                  onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                  onChange={patch} onDeleted={() => setTenders((prev) => prev?.filter((x) => x.id !== t.id) ?? null)} onError={onError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TenderForm({ owners, initial, onCancel, onSaved, onError }: {
  owners: Owner[];
  initial?: TenderDto;
  onCancel: () => void;
  onSaved: (t: TenderDto) => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '', issuer: initial?.issuer ?? '', reference: initial?.reference ?? '',
    kind: (initial?.kind ?? 'PUBLIC_TENDER') as TenderKind,
    valueKes: initial?.estimatedValueCents != null ? String(initial.estimatedValueCents / 100) : '',
    submissionDeadline: initial?.submissionDeadline ?? '', packToCooBy: initial?.packToCooBy ?? '',
    ownerId: initial?.ownerId ?? '', notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.packToCooBy > form.submissionDeadline) { onError('The pack must reach the COO before the submission deadline.'); return; }
    setSaving(true);
    onError(null);
    const body: CreateTenderInput = {
      title: form.title.trim(), issuer: form.issuer.trim(), reference: form.reference.trim() || null, kind: form.kind,
      estimatedValueCents: form.valueKes ? Math.round(parseFloat(form.valueKes) * 100) : null,
      submissionDeadline: form.submissionDeadline, packToCooBy: form.packToCooBy,
      ownerId: form.ownerId || null, notes: form.notes.trim() || null,
    };
    try {
      const res = initial ? await api.updateTender(initial.id, body) : await api.createTender(body);
      onSaved(res.tender);
    } catch (err) {
      onError(messageFrom(err, 'Could not save the tender'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-gold-bright/40 bg-gold-bright/[0.06] p-5 sm:grid-cols-3">
      <div className="sm:col-span-2"><Labelled label="Title"><input required className={input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Labelled></div>
      <Labelled label="Kind">
        <select className={input} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TenderKind }))}>
          {(Object.keys(TENDER_KIND_LABEL) as TenderKind[]).map((k) => <option key={k} value={k}>{TENDER_KIND_LABEL[k]}</option>)}
        </select>
      </Labelled>
      <Labelled label="Issuer"><input required className={input} value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} /></Labelled>
      <Labelled label="Tender reference"><input className={input} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} /></Labelled>
      <Labelled label="Estimated value (KSh)"><input type="number" min={0} className={input} value={form.valueKes} onChange={(e) => setForm((f) => ({ ...f, valueKes: e.target.value }))} /></Labelled>
      <Labelled label="Pack to COO by"><input required type="date" className={input} value={form.packToCooBy} onChange={(e) => setForm((f) => ({ ...f, packToCooBy: e.target.value }))} /></Labelled>
      <Labelled label="Submission deadline"><input required type="date" className={input} value={form.submissionDeadline} onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))} /></Labelled>
      <Labelled label="Owner">
        <select className={input} value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}>
          <option value="">Unassigned</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </Labelled>
      <div className="sm:col-span-3"><Labelled label="Notes"><input className={input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Labelled></div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Log tender'}</button>
      </div>
    </form>
  );
}

function TenderRow({ tender: t, owners, expanded, onToggle, onChange, onDeleted, onError }: {
  tender: TenderDto;
  owners: Owner[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (t: TenderDto) => void;
  onDeleted: () => void;
  onError: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState<TenderEventDto[] | null>(null);
  const [note, setNote] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const open = TENDER_OPEN.includes(t.status);

  useEffect(() => {
    if (!expanded) return;
    let live = true;
    api.tenderEvents(t.id).then((r) => { if (live) setEvents(r.events); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [expanded, t.id, reloadKey]);

  const run = async (optimistic: Partial<TenderDto> | null, call: () => Promise<{ tender: TenderDto }>, fallback: string) => {
    setBusy(true);
    onError(null);
    const before = t;
    if (optimistic) onChange({ ...t, ...optimistic });
    try { onChange((await call()).tender); setReloadKey((k) => k + 1); }
    catch (err) { onChange(before); onError(messageFrom(err, fallback)); }
    finally { setBusy(false); }
  };

  const setStatus = (status: TenderStatus) => {
    if (status === t.status) return;
    const final = status === 'AWARDED' || status === 'NOT_AWARDED' || status === 'WITHDRAWN';
    if (final && !confirm(`Mark “${t.title}” as ${TENDER_STATUS_LABEL[status].toLowerCase()}?`)) return;
    void run({ status }, () => api.changeTenderStatus(t.id, { status }), 'Could not change the status');
  };

  return (
    <>
      <tr className="align-top hover:bg-cream/40">
        <td className="px-4 py-3">
          <div className="font-medium">{t.title}</div>
          <div className="text-xs text-charcoal-muted">{t.issuer} · {TENDER_KIND_LABEL[t.kind]}{t.reference ? ` · Ref ${t.reference}` : ''}</div>
        </td>
        <td className="px-4 py-3">
          <select value={t.status} disabled={busy} onChange={(e) => setStatus(e.target.value as TenderStatus)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs">
            {TENDER_STATUSES.map((s) => <option key={s} value={s}>{TENDER_STATUS_LABEL[s]}</option>)}
          </select>
        </td>
        <td className="px-4 py-3"><Countdown days={t.daysToPack} date={t.packToCooBy} open={open} label="Pack" /></td>
        <td className="px-4 py-3"><Countdown days={t.daysToDeadline} date={t.submissionDeadline} open={open || t.status === 'PACK_WITH_COO'} label="Due" /></td>
        <td className="px-4 py-3 text-right tabular-nums">{t.estimatedValueCents != null ? money(t.estimatedValueCents) : '—'}</td>
        <td className="px-4 py-3 text-xs text-charcoal-muted">{t.ownerName ?? '—'}</td>
        <td className="px-4 py-3 text-right"><button className={btnGhost} onClick={onToggle}>{expanded ? '▲ Hide' : '▼ Details'}</button></td>
      </tr>
      {expanded && (
        <tr className="bg-cream/40">
          <td colSpan={7} className="px-4 py-4">
            {editing ? (
              <TenderForm owners={owners} initial={t} onCancel={() => setEditing(false)} onSaved={(u) => { setEditing(false); onChange(u); setReloadKey((k) => k + 1); }} onError={onError} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row k="Pack to COO by" v={dateOnly(t.packToCooBy)} />
                    <Row k="Submission deadline" v={dateOnly(t.submissionDeadline)} />
                    <Row k="Submitted" v={t.submittedAt ? when(t.submittedAt) : '—'} />
                    <Row k="Decided" v={t.decidedAt ? when(t.decidedAt) : '—'} />
                    <Row k="Notes" v={t.notes ?? '—'} />
                    <Row k="Logged by" v={`${t.createdByName ?? 'unknown'} · ${when(t.createdAt)}`} />
                  </dl>
                  <div className="flex gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the activity log" className={input} />
                    <button className={btn} disabled={busy || !note.trim()} onClick={() => { void run(null, () => api.addTenderNote(t.id, note.trim()), 'Could not add the note'); setNote(''); }}>Add</button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button className={btnGhost} onClick={() => setEditing(true)}>Edit details</button>
                    <button className="text-danger hover:underline" onClick={async () => {
                      if (!confirm(`Delete “${t.title}” and its activity log?`)) return;
                      try { await api.deleteTender(t.id); onDeleted(); } catch (err) { onError(messageFrom(err, 'Could not delete the tender')); }
                    }}>Delete tender</button>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">Activity log ({t.eventCount})</p>
                  {events ? <EventList events={events} /> : <p className="text-sm text-charcoal-muted">Loading history…</p>}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Targets & actuals ────────────────────────────────────────────────────────

function TargetsTab({ editable, household, onError }: { editable: boolean; household: boolean; onError: (m: string | null) => void }) {
  const [targets, setTargets] = useState<FunnelTargets | null>(null);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedByName: string | null }>({ updatedAt: null, updatedByName: null });
  const [month, setMonth] = useState(thisMonth());
  const [actuals, setActuals] = useState<FunnelActualsDto | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.funnelTargets();
      setTargets(res.targets);
      setMeta({ updatedAt: res.updatedAt, updatedByName: res.updatedByName });
    } catch (err) { onError(messageFrom(err, 'Could not load the targets')); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let live = true;
    setActuals(null);
    api.funnelActuals(month).then((r) => { if (live) setActuals(r.actuals); }).catch((err) => { if (live) onError(messageFrom(err, 'Could not load the actuals')); });
    return () => { live = false; };
  }, [month, onError]);

  const months = useMemo(() => {
    if (!targets) return [thisMonth()];
    const keys = new Set<string>([...Object.keys(targets.series[0]?.byMonth ?? {}), thisMonth()]);
    return [...keys].sort();
  }, [targets]);

  const startEditing = () => {
    if (!confirm(`These targets are ${targets?.sourcePolicy ?? 'locked'}. Changing them outside a quarterly review breaks the plan's comparability. Continue?`)) return;
    setEditing(true);
  };

  if (!targets) return <Empty>Loading…</Empty>;

  if (editing) {
    return (
      <TargetsEditor
        targets={targets}
        onCancel={() => setEditing(false)}
        onSaved={(t, m) => { setTargets(t); setMeta(m); setEditing(false); }}
        onError={onError}
      />
    );
  }

  const visibleSeries = household ? (s: { owner: string }) => s.owner === 'MARKETING' : () => true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-charcoal-muted">
          Locked rates and monthly targets from the sales plan (<span className="italic">{targets.sourcePolicy}</span>).
          {meta.updatedAt ? ` Last changed by ${meta.updatedByName ?? 'unknown'} · ${when(meta.updatedAt)}.` : ' Workbook values; never edited.'}
        </p>
        <div className="flex items-center gap-2">
          <select className={`${input} w-auto`} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T12:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</option>)}
          </select>
          {editable && <button className={`${btnGhost} whitespace-nowrap`} onClick={startEditing}>Edit targets…</button>}
        </div>
      </div>

      {/* Actual vs locked per stage */}
      <Section title={`Conversion — actual vs locked · ${actuals?.monthLabel ?? '…'}${actuals ? ` (year ${actuals.year} rates)` : ''}`}>
        {!actuals ? <p className="text-sm text-charcoal-muted">Loading…</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                <th className="py-2 pr-3 font-normal">Stage</th>
                <th className="py-2 pr-3 text-right font-normal">Reached / prior</th>
                <th className="py-2 pr-3 text-right font-normal">Actual</th>
                <th className="py-2 pr-3 text-right font-normal">Locked</th>
                <th className="py-2 font-normal">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {actuals.stages.filter((s) => !household || s.key.startsWith('household') || s.key.startsWith('repeat_household')).map((s) => (
                <tr key={s.key} className={s.belowLocked ? 'bg-danger/5' : ''}>
                  <td className="py-2 pr-3">{s.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-charcoal-muted">{s.tracked ? `${s.numerator} / ${s.denominator}` : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">{s.actualRate === null ? '—' : pct(s.actualRate)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(s.lockedRate)}</td>
                  <td className="py-2 text-xs">
                    {!s.tracked ? <span className="text-charcoal-muted">Not measured from activity</span>
                      : s.actualRate === null ? <span className="text-charcoal-muted">No activity at the prior stage</span>
                      : s.belowLocked ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">More than 20% below locked — fix the cause</span>
                      : s.actualRate < s.lockedRate ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">Below locked</span>
                      : <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">On or above locked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Activity: target vs actual */}
      <Section title={`Activity — target vs actual · ${actuals?.monthLabel ?? '…'}`}>
        {!actuals ? <p className="text-sm text-charcoal-muted">Loading…</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
                <th className="py-2 pr-3 font-normal">Series</th>
                <th className="py-2 pr-3 font-normal">Owner</th>
                <th className="py-2 pr-3 text-right font-normal">Target / expected</th>
                <th className="py-2 pr-3 text-right font-normal">Actual</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {actuals.activity.filter(visibleSeries).map((a) => {
                const short = a.tracked && a.target !== null && a.actual !== null && a.kind === 'TARGET' && a.actual < a.target;
                return (
                  <tr key={a.key} className={short ? 'bg-warning/5' : ''}>
                    <td className="py-2 pr-3">{a.label}{a.kind === 'EXPECTED' && <span className="ml-1 text-xs text-charcoal-muted">(expected)</span>}</td>
                    <td className="py-2 pr-3 text-xs text-charcoal-muted">{a.owner === 'BD_LEAD' ? 'BD lead' : 'Marketing'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.target === null ? '—' : a.target}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{a.actual === null ? '—' : a.actual}</td>
                    <td className="py-2 text-xs text-charcoal-muted">{!a.tracked ? 'Not tracked here' : short ? <span className="text-warning">Behind target</span> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Locked rates — reference */}
      <Section title="Locked conversion rates (reference)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="py-2 pr-3 font-normal">Rate</th>
              <th className="py-2 pr-3 text-right font-normal">Year 1</th>
              <th className="py-2 text-right font-normal">Year 2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {targets.lockedRates.map((r) => (
              <tr key={r.key}><td className="py-1.5 pr-3">{r.label}</td><td className="py-1.5 pr-3 text-right tabular-nums">{pct(r.year1)}</td><td className="py-1.5 text-right tabular-nums">{r.year2 !== undefined ? pct(r.year2) : <span className="text-charcoal-muted">same</span>}</td></tr>
            ))}
            <tr><td className="py-1.5 pr-3">Months between repeat household bookings</td><td className="py-1.5 pr-3 text-right tabular-nums">{targets.monthsBetweenRepeatBookings}</td><td /></tr>
          </tbody>
        </table>
      </Section>

      {!household && <Calculator />}
    </div>
  );
}

function TargetsEditor({ targets, onCancel, onSaved, onError }: {
  targets: FunnelTargets;
  onCancel: () => void;
  onSaved: (t: FunnelTargets, meta: { updatedAt: string | null; updatedByName: string | null }) => void;
  onError: (m: string | null) => void;
}) {
  const [draft, setDraft] = useState<FunnelTargets>(targets);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const months = Object.keys(targets.series[0]?.byMonth ?? {}).sort();
  const dirty = JSON.stringify(draft) !== JSON.stringify(targets);

  const save = async () => {
    if (!confirm('Save the changed targets? This rewrites the locked plan for everyone.')) return;
    setSaveState('saving');
    onError(null);
    try {
      const res = await api.saveFunnelTargets(draft);
      setSaveState('saved');
      onSaved(res.targets, { updatedAt: res.updatedAt, updatedByName: res.updatedByName });
    } catch (err) {
      setSaveState('failed');
      onError(messageFrom(err, 'Could not save the targets'));
    }
  };

  const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0);
  const setRate = (i: number, field: 'year1' | 'year2', value: string) =>
    setDraft((d) => ({ ...d, lockedRates: d.lockedRates.map((r, j) => (j === i ? { ...r, [field]: value === '' && field === 'year2' ? undefined : Math.min(1, Math.max(0, num(value) / 100)) } : r)) }));
  const setCell = (key: string, m: string, value: string) =>
    setDraft((d) => ({ ...d, series: d.series.map((s) => (s.key === key ? { ...s, byMonth: { ...s.byMonth, [m]: Math.max(0, num(value)) } } : s)) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
        <span className="text-charcoal">Editing the locked targets ({draft.sourcePolicy}). Rates in %, activity as counts.</span>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${saveState === 'failed' ? 'font-medium text-danger' : saveState === 'saved' ? 'font-medium text-success' : 'text-charcoal-muted'}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'failed' ? '⚠ Not saved — try again' : dirty ? 'Unsaved changes' : ''}
          </span>
          <button className={btnGhost} onClick={onCancel}>Cancel</button>
          <button className={btn} disabled={!dirty || saveState === 'saving'} onClick={() => void save()}>Save targets</button>
        </div>
      </div>

      <Section title="Locked conversion rates (%)">
        <div className="grid gap-2">
          {draft.lockedRates.map((r, i) => (
            <div key={r.key} className="grid items-center gap-2 sm:grid-cols-[1fr_120px_120px]">
              <span className="text-sm">{r.label}</span>
              <input type="number" min={0} max={100} step={1} className={input} value={Math.round(r.year1 * 1000) / 10} onChange={(e) => setRate(i, 'year1', e.target.value)} title="Year 1" />
              <input type="number" min={0} max={100} step={1} className={input} value={r.year2 !== undefined ? Math.round(r.year2 * 1000) / 10 : ''} placeholder="same as Y1" onChange={(e) => setRate(i, 'year2', e.target.value)} title="Year 2" />
            </div>
          ))}
          <div className="grid items-center gap-2 sm:grid-cols-[1fr_120px_120px]">
            <span className="text-sm">Months between repeat household bookings</span>
            <input type="number" min={1} step={1} className={input} value={draft.monthsBetweenRepeatBookings} onChange={(e) => setDraft((d) => ({ ...d, monthsBetweenRepeatBookings: Math.max(1, Math.round(num(e.target.value))) }))} />
          </div>
        </div>
      </Section>

      <Section title="Monthly activity table">
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-left uppercase tracking-widest text-charcoal-muted">
                <th className="sticky left-0 bg-white py-2 pr-3 font-normal">Series</th>
                {months.map((m) => <th key={m} className="px-1 py-2 text-right font-normal">{m.slice(2).replace('-', '/')}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {draft.series.map((s) => (
                <tr key={s.key}>
                  <td className="sticky left-0 whitespace-nowrap bg-white py-1 pr-3">{s.label}<span className="ml-1 text-charcoal-muted">{s.kind === 'EXPECTED' ? '(exp.)' : ''}</span></td>
                  {months.map((m) => (
                    <td key={m} className="px-0.5 py-1">
                      <input type="number" min={0} step="any" className="w-16 rounded border border-line bg-white px-1 py-0.5 text-right text-xs" value={s.byMonth[m] ?? 0} onChange={(e) => setCell(s.key, m, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/** Required Activity — the sheet's back-calculator, as an on-demand tool. Nothing is stored. */
function Calculator() {
  const [wins, setWins] = useState('12');
  const [year, setYear] = useState<1 | 2>(1);
  const [mix, setMix] = useState<Record<CalculatorChannel, string>>({ DIRECT_OUTREACH: '50', WARM_INTRO: '25', PUBLIC_TENDER: '10', PRIVATE_RFQ: '15', HOUSEHOLD: '0' });
  const [result, setResult] = useState<RequiredActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = CALC_CHANNELS.reduce((a, c) => a + (parseFloat(mix[c.key]) || 0), 0);

  const calculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (Math.round(total) !== 100) { setError(`The channel mix adds up to ${Math.round(total)}% — it needs to be 100%.`); return; }
    setBusy(true);
    try {
      const res = await api.requiredActivity({
        winsWantedPerYear: parseFloat(wins) || 0,
        year,
        channelMix: Object.fromEntries(CALC_CHANNELS.map((c) => [c.key, (parseFloat(mix[c.key]) || 0) / 100])) as Record<CalculatorChannel, number>,
      });
      setResult(res.result);
    } catch (err) {
      setError(messageFrom(err, 'Could not calculate'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Required activity calculator">
      <p className="mb-3 text-xs text-charcoal-muted">Enter the wins you want in a year and how they split across channels; the locked rates say how much activity that takes. Nothing here is saved.</p>
      <form onSubmit={(e) => void calculate(e)} className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Labelled label="Wins wanted / year"><input type="number" min={0} className={input} value={wins} onChange={(e) => setWins(e.target.value)} /></Labelled>
        <Labelled label="Rates">
          <select className={input} value={year} onChange={(e) => setYear(Number(e.target.value) as 1 | 2)}>
            <option value={1}>Year 1</option><option value={2}>Year 2</option>
          </select>
        </Labelled>
        {CALC_CHANNELS.map((c) => (
          <Labelled key={c.key} label={`${c.label} %`}>
            <input type="number" min={0} max={100} className={input} value={mix[c.key]} onChange={(e) => setMix((m) => ({ ...m, [c.key]: e.target.value }))} />
          </Labelled>
        ))}
        <div className="flex items-end"><button type="submit" disabled={busy} className={btn}>{busy ? '…' : 'Calculate'}</button></div>
      </form>
      <p className={`mt-2 text-xs ${Math.round(total) === 100 ? 'text-charcoal-muted' : 'text-warning'}`}>Mix total: {Math.round(total)}%</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {result && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-charcoal-muted">
              <th className="py-2 pr-3 font-normal">Channel</th>
              <th className="py-2 pr-3 text-right font-normal">Wins / year</th>
              <th className="py-2 pr-3 text-right font-normal">Conversion</th>
              <th className="py-2 pr-3 font-normal">Activity needed</th>
              <th className="py-2 pr-3 text-right font-normal">Per year</th>
              <th className="py-2 pr-3 text-right font-normal">Per month</th>
              <th className="py-2 font-normal">Along the way (per year)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.channels.filter((c) => c.share > 0).map((c) => (
              <tr key={c.channel}>
                <td className="py-2 pr-3">{c.label} <span className="text-xs text-charcoal-muted">({pct(c.share)})</span></td>
                <td className="py-2 pr-3 text-right tabular-nums">{c.winsPerYear}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(c.conversion)}</td>
                <td className="py-2 pr-3">{c.activityLabel}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium">{c.activityPerYear}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium">{c.activityPerMonth}</td>
                <td className="py-2 text-xs text-charcoal-muted">{c.stages.map((s) => `${s.label} ${s.perYear}`).join(' → ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">{title}</h2>
      {children}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-charcoal-muted">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-charcoal-muted">{k}</dt>
      <dd className="text-charcoal">{v}</dd>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">{children}</div>;
}
