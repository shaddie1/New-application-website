'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONTRACT_TYPE_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SEGMENT_LABELS,
  TENDER_STATUS_LABELS,
  type BidDecision,
  type CalculatorChannel,
  type CreateLeadInput,
  type CreateTenderInput,
  type FunnelActualsDto,
  type FunnelTargets,
  type LeadDto,
  type LeadEventDto,
  type LeadStage,
  type RequiredActivityResult,
  type TenderDto,
  type TenderEventDto,
  type TenderType,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { csvMoney, downloadCsv } from '../../../src/lib/csv';
import { canEditTargets, canMarkCommission, canViewPipeline, householdOnly } from '../../../src/lib/roles';

// ── Labels ───────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<LeadStage, string> = {
  CONTACTED: 'Contacted', CONVERSATION: 'Conversation', SITE_VISIT: 'Site visit', PROPOSAL_SENT: 'Proposal sent', WON: 'Won', LOST: 'Lost',
};
const STAGES = Object.keys(STAGE_LABEL) as LeadStage[];
/** The live funnel, in order. Won and Lost sit outside it. */
const PIPELINE: LeadStage[] = ['CONTACTED', 'CONVERSATION', 'SITE_VISIT', 'PROPOSAL_SENT'];

const TENDER_TYPE_LABEL: Record<TenderType, string> = { TENDER: 'Tender', EOI: 'EOI', RFQ: 'RFQ', PREQUALIFICATION: 'Prequalification' };
const BID_LABEL: Record<BidDecision, string> = { BID: 'Bid', NO_BID: 'No bid' };
/** Once the pack is in (or the tender is closed), the dates stop mattering. */
const tenderClosed = (status: string) => /submitted|awarded|no bid|withdrawn|lost|unsuccessful/i.test(status);

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
/** The sheet's rule: the pack reaches the COO two days before the deadline. */
function packDefault(deadline: string) {
  if (!deadline) return '';
  const d = new Date(`${deadline}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
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

type Person = { id: string; fullName: string; role: string };

function LeadsTab({ household, canPay, onError }: { household: boolean; canPay: boolean; onError: (m: string | null) => void }) {
  const [leads, setLeads] = useState<LeadDto[] | null>(null);
  const [commission, setCommission] = useState({ dueCents: 0, dueCount: 0, paidCents: 0 });
  const [people, setPeople] = useState<Person[]>([]);
  const [filters, setFilters] = useState<{ stage: '' | LeadStage; segment: string; channel: string; broughtInById: string }>({
    stage: '', segment: '', channel: '', broughtInById: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.leads({ segment: filters.segment, channel: filters.channel, broughtInById: filters.broughtInById });
      setLeads(res.leads);
      setCommission(res.commission);
    } catch (err) {
      onError(messageFrom(err, 'Could not load leads'));
    }
  }, [filters.segment, filters.channel, filters.broughtInById, onError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.pipelinePeople().then((r) => setPeople(r.people)).catch(() => setPeople([])); }, []);

  const patch = (updated: LeadDto) => setLeads((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? null);

  const shown = (leads ?? []).filter((l) => !filters.stage || l.stage === filters.stage);
  const counts = STAGES.reduce((acc, s) => ({ ...acc, [s]: (leads ?? []).filter((l) => l.stage === s).length }), {} as Record<LeadStage, number>);
  const won = (leads ?? []).filter((l) => l.stage === 'WON' && (l.commissionCents ?? 0) > 0);
  const segments = [...new Set<string>([...LEAD_SEGMENT_LABELS, ...(leads ?? []).map((l) => l.segment)])];
  const channels = [...new Set<string>([...LEAD_CHANNEL_LABELS, ...(leads ?? []).map((l) => l.channel)])];

  const exportCommission = () =>
    downloadCsv('lead-commission', [
      { header: 'Lead', value: (l: LeadDto) => l.leadId },
      { header: 'Won on', value: (l) => (l.wonAt ? l.wonAt.slice(0, 10) : '') },
      { header: 'Client / organisation', value: (l) => l.clientOrg },
      { header: 'Contact', value: (l) => l.contactName },
      { header: 'Brought in by', value: (l) => l.broughtInByName ?? '' },
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
          <div>
            <p className="text-xs uppercase tracking-widest text-charcoal-muted">Total commission due</p>
            <p className="mt-1 text-2xl" style={{ fontFamily: 'Georgia, serif' }}>{money(commission.dueCents)}</p>
            <p className="text-xs text-charcoal-muted">
              {commission.dueCount} won lead{commission.dueCount === 1 ? '' : 's'} unpaid · {money(commission.paidCents)} paid to date · paid to whoever brought the lead in
            </p>
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
        <select className={input} value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value }))} disabled={household}>
          <option value="">All segments</option>
          {segments.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={input} value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}>
          <option value="">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={input} value={filters.broughtInById} onChange={(e) => setFilters((f) => ({ ...f, broughtInById: e.target.value }))}>
          <option value="">Brought in by anyone</option>
          {people.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </div>

      {showForm && (
        <LeadForm
          people={people}
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
              people={people}
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

function LeadForm({ people, household, initial, onCancel, onSaved, onError }: {
  people: Person[];
  household: boolean;
  initial?: LeadDto;
  onCancel: () => void;
  onSaved: (lead: LeadDto) => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState({
    dateLogged: initial?.dateLogged ?? todayIso(),
    clientOrg: initial?.clientOrg ?? '',
    segment: initial?.segment ?? (household ? 'Household' : 'Office'),
    broughtInById: initial?.broughtInById ?? '',
    channel: initial?.channel ?? (household ? 'Household enquiry' : 'Direct outreach'),
    contactName: initial?.contactName ?? '',
    contactPhone: initial?.contactPhone ?? '',
    valueKes: initial?.quoteValueCents != null ? String(initial.quoteValueCents / 100) : '',
    contractType: initial?.contractType ?? '',
    expectedClose: initial?.expectedClose ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientOrg.trim() || !form.contactName.trim()) return;
    setSaving(true);
    onError(null);
    const body: CreateLeadInput = {
      dateLogged: form.dateLogged || undefined,
      clientOrg: form.clientOrg.trim(),
      segment: form.segment.trim(),
      // Blank on a new lead means "me"; the API fills in whoever logs it.
      broughtInById: form.broughtInById ? form.broughtInById : initial ? null : undefined,
      channel: form.channel.trim(),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim() || null,
      quoteValueCents: form.valueKes ? Math.round(parseFloat(form.valueKes) * 100) : null,
      contractType: form.contractType.trim() || null,
      expectedClose: form.expectedClose || null,
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
      <div className="sm:col-span-2"><Labelled label="Client / organisation"><input required className={input} value={form.clientOrg} placeholder="Riverside Towers Ltd, or the household name" onChange={(e) => setForm((f) => ({ ...f, clientOrg: e.target.value }))} /></Labelled></div>
      <Labelled label="Date logged"><input type="date" className={input} value={form.dateLogged} onChange={(e) => setForm((f) => ({ ...f, dateLogged: e.target.value }))} /></Labelled>
      <Labelled label="Contact name"><input required className={input} value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} /></Labelled>
      <Labelled label="Contact phone"><input className={input} value={form.contactPhone} placeholder="0712 345 678" onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} /></Labelled>
      <Labelled label="Brought in by">
        <select className={input} value={form.broughtInById} onChange={(e) => setForm((f) => ({ ...f, broughtInById: e.target.value }))}>
          <option value="">{initial ? 'Unassigned' : 'Me (whoever logs it first)'}</option>
          {people.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
        </select>
      </Labelled>
      <Labelled label="Segment">
        <input required list="lead-segments" className={input} value={form.segment} disabled={household} onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))} />
        <datalist id="lead-segments">{LEAD_SEGMENT_LABELS.map((s) => <option key={s} value={s} />)}</datalist>
      </Labelled>
      <Labelled label="Channel">
        <input required list="lead-channels" className={input} value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} />
        <datalist id="lead-channels">{LEAD_CHANNEL_LABELS.map((c) => <option key={c} value={c} />)}</datalist>
      </Labelled>
      <Labelled label="Contract type">
        <input list="contract-types" className={input} value={form.contractType} placeholder="One-off, Monthly (1 visit), …" onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))} />
        <datalist id="contract-types">{CONTRACT_TYPE_LABELS.map((c) => <option key={c} value={c} />)}</datalist>
      </Labelled>
      <Labelled label="Quote value (KSh)"><input type="number" min={0} className={input} value={form.valueKes} onChange={(e) => setForm((f) => ({ ...f, valueKes: e.target.value }))} /></Labelled>
      <Labelled label="Expected close"><input type="date" className={input} value={form.expectedClose} onChange={(e) => setForm((f) => ({ ...f, expectedClose: e.target.value }))} /></Labelled>
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

function LeadCard({ lead: l, people, household, canPay, expanded, onToggle, onChange, onDeleted, onError }: {
  lead: LeadDto;
  people: Person[];
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
    if (!confirm(`Create a quote request for ${l.clientOrg} and open it in the Quote Builder?`)) return;
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
    const reference = prompt(`Payment reference for ${money(l.commissionCents ?? 0)} commission to ${l.broughtInByName ?? 'unassigned'} (M-Pesa or bank):`);
    if (reference === null) return;
    void run('paid', { commissionPaidAt: new Date().toISOString(), commissionReference: reference.trim() || null },
      () => api.markLeadCommissionPaid(l.id, { reference: reference.trim() || undefined }), 'Could not mark the commission paid');
  };

  const remove = async () => {
    if (!confirm(`Delete ${l.leadId} (${l.clientOrg}) and its activity log?`)) return;
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
  const closeSoon = l.expectedClose && l.expectedClose <= todayIso() && l.stage !== 'WON' && l.stage !== 'LOST';

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-charcoal-muted">{l.leadId}</span>
            <span className="font-medium text-charcoal">{l.clientOrg}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${stageTone(l.stage)}`}>{STAGE_LABEL[l.stage]}</span>
            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">{l.segment}</span>
            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">{l.channel}</span>
            {l.contractType && <span className="rounded-full bg-gold-bright/20 px-2 py-0.5 text-xs text-bronze">{l.contractType}</span>}
            {l.linkedQuoteId && (
              <a href={`/quotes?open=${encodeURIComponent(l.linkedQuoteId)}`} className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success hover:underline">
                Quote · {(l.linkedQuoteStatus ?? '').toLowerCase().replace(/_/g, ' ')}
              </a>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-charcoal-muted">
            <span>{l.contactName}</span>
            {l.contactPhone && <span>· {l.contactPhone}</span>}
            <span>· logged {dateOnly(l.dateLogged)}</span>
            <span>· brought in by {l.broughtInByName ?? 'unassigned'}</span>
            {l.quoteValueCents != null && <span className="font-medium text-charcoal">· {money(l.quoteValueCents)}</span>}
            {l.expectedClose && <span className={closeSoon ? 'font-medium text-warning' : ''}>· expected close {dateOnly(l.expectedClose)}</span>}
          </div>
          {l.stage === 'WON' && l.netProfitCents != null && (
            <p className="mt-1 text-xs text-charcoal-muted">
              Won {l.wonAt ? when(l.wonAt) : ''} · revenue {money(l.revenueReceivedCents ?? 0)} − costs {money(l.actualDirectCostsCents ?? 0)} = net{' '}
              <span className={`font-medium ${l.netProfitCents >= 0 ? 'text-success' : 'text-danger'}`}>{money(l.netProfitCents)}</span>
              {(l.commissionCents ?? 0) > 0 && (
                <> · commission <span className="font-medium text-charcoal">{money(l.commissionCents!)}</span> to {l.broughtInByName ?? 'unassigned'}{' '}
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
          {l.stage === 'PROPOSAL_SENT' && !l.linkedQuoteId && (
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
            <LeadForm people={people} household={household} initial={l} onCancel={() => setEditing(false)}
              onSaved={(updated) => { setEditing(false); onChange(updated); setReloadKey((k) => k + 1); }} onError={onError} />
          ) : (
            <div className="space-y-3">
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Row k="Contact" v={[l.contactName, l.contactPhone].filter(Boolean).join(' · ')} />
                <Row k="Brought in by" v={l.broughtInByName ?? 'unassigned'} />
                <Row k="Quote value" v={l.quoteValueCents != null ? money(l.quoteValueCents) : '—'} />
                <Row k="Contract type" v={l.contractType ?? '—'} />
                <Row k="Expected close" v={l.expectedClose ? dateOnly(l.expectedClose) : '—'} />
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
  const [revenue, setRevenue] = useState(lead.quoteValueCents != null ? String(lead.quoteValueCents / 100) : '');
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
      if (!confirm(`Mark ${lead.clientOrg} as won with net profit ${money(net)}? Commission goes to ${lead.broughtInByName ?? 'unassigned'}.`)) return;
      onSubmit({ stage: 'WON', revenueReceivedCents: rev, actualDirectCostsCents: cost, note: note.trim() || undefined });
    } else {
      if (!reason.trim()) return;
      if (!confirm(`Mark ${lead.clientOrg} as lost?`)) return;
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
            <p className="text-xs text-charcoal-muted">Commission at the rates-card rate to {lead.broughtInByName ?? 'unassigned'}</p>
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
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTenders((await api.tenders()).tenders); }
    catch (err) { onError(messageFrom(err, 'Could not load tenders')); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const patch = (t: TenderDto) => setTenders((prev) => prev?.map((x) => (x.id === t.id ? t : x)) ?? null);
  const open = (t: TenderDto) => !tenderClosed(t.status) && t.bidDecision !== 'NO_BID';
  const dueSoon = (tenders ?? []).filter((t) => open(t) && ((!t.dateSentToCoo && t.daysToPack <= 5) || t.daysToDeadline <= 5));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-charcoal-muted">{tenders?.length ?? 0} tender{tenders?.length === 1 ? '' : 's'} · {(tenders ?? []).filter(open).length} in preparation</span>
        <button className={btn} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ New tender'}</button>
      </div>

      {dueSoon.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">{dueSoon.length} tender{dueSoon.length === 1 ? '' : 's'} due within 5 days</span>
          <span className="text-charcoal-muted"> — {dueSoon.map((t) => `${t.title} (${t.dateSentToCoo ? 'pack sent' : t.daysToPack < 0 ? 'pack overdue' : `pack in ${t.daysToPack}d`}, deadline in ${t.daysToDeadline}d)`).join(', ')}</span>
        </div>
      )}

      {showForm && (
        <TenderForm onCancel={() => setShowForm(false)}
          onSaved={(t) => { setShowForm(false); setTenders((prev) => [t, ...(prev ?? [])].sort((a, b) => a.submissionDeadline.localeCompare(b.submissionDeadline))); setExpanded(t.id); }}
          onError={onError} />
      )}

      {!tenders ? <Empty>Loading…</Empty> : tenders.length === 0 ? (
        <Empty>No tenders logged. Click <strong>+ New tender</strong> when one is found.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/60 text-left text-xs uppercase tracking-widest text-charcoal-muted">
                <th className="px-4 py-3 font-normal">Tender</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Pack to COO</th>
                <th className="px-4 py-3 font-normal">Submission</th>
                <th className="px-4 py-3 font-normal">Bid?</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenders.map((t) => (
                <TenderRow key={t.id} tender={t} open={open(t)} expanded={expanded === t.id}
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

function TenderForm({ initial, onCancel, onSaved, onError }: {
  initial?: TenderDto;
  onCancel: () => void;
  onSaved: (t: TenderDto) => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState({
    tenderRef: initial?.tenderRef ?? '', title: initial?.title ?? '', issuingOrg: initial?.issuingOrg ?? '', sourcePortal: initial?.sourcePortal ?? '',
    type: (initial?.type ?? 'TENDER') as TenderType, agpoReserved: initial?.agpoReserved ?? false,
    dateFound: initial?.dateFound ?? todayIso(), submissionDeadline: initial?.submissionDeadline ?? '', packToCooBy: initial?.packToCooBy ?? '',
    packOverridden: !!initial, bidDecision: (initial?.bidDecision ?? '') as '' | BidDecision, status: initial?.status ?? 'Identified',
    dateSentToCoo: initial?.dateSentToCoo ?? '', notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  // The pack date follows the deadline (two days before, 5 pm) until someone overrides it.
  const setDeadline = (submissionDeadline: string) =>
    setForm((f) => ({ ...f, submissionDeadline, packToCooBy: f.packOverridden ? f.packToCooBy : packDefault(submissionDeadline) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.packToCooBy && form.packToCooBy > form.submissionDeadline) { onError('The pack must reach the COO before the submission deadline.'); return; }
    setSaving(true);
    onError(null);
    const body: CreateTenderInput = {
      tenderRef: form.tenderRef.trim(), title: form.title.trim(), issuingOrg: form.issuingOrg.trim(), sourcePortal: form.sourcePortal.trim() || null,
      type: form.type, agpoReserved: form.agpoReserved, dateFound: form.dateFound || undefined,
      submissionDeadline: form.submissionDeadline, packToCooBy: form.packToCooBy || null,
      bidDecision: form.bidDecision || null, status: form.status.trim() || undefined,
      dateSentToCoo: form.dateSentToCoo || null, notes: form.notes.trim() || null,
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
    <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-gold-bright/40 bg-gold-bright/[0.06] p-5 sm:grid-cols-4">
      <Labelled label="Tender ref"><input required className={input} value={form.tenderRef} onChange={(e) => setForm((f) => ({ ...f, tenderRef: e.target.value }))} /></Labelled>
      <div className="sm:col-span-3"><Labelled label="Title"><input required className={input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Labelled></div>
      <div className="sm:col-span-2"><Labelled label="Issuing organisation"><input required className={input} value={form.issuingOrg} onChange={(e) => setForm((f) => ({ ...f, issuingOrg: e.target.value }))} /></Labelled></div>
      <Labelled label="Source portal"><input className={input} value={form.sourcePortal} placeholder="PPIP, UNGM, …" onChange={(e) => setForm((f) => ({ ...f, sourcePortal: e.target.value }))} /></Labelled>
      <Labelled label="Type">
        <select className={input} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TenderType }))}>
          {(Object.keys(TENDER_TYPE_LABEL) as TenderType[]).map((k) => <option key={k} value={k}>{TENDER_TYPE_LABEL[k]}</option>)}
        </select>
      </Labelled>
      <Labelled label="Date found"><input type="date" className={input} value={form.dateFound} onChange={(e) => setForm((f) => ({ ...f, dateFound: e.target.value }))} /></Labelled>
      <Labelled label="Submission deadline"><input required type="date" className={input} value={form.submissionDeadline} onChange={(e) => setDeadline(e.target.value)} /></Labelled>
      <Labelled label="Pack to COO by (5 pm)"><input type="date" className={input} value={form.packToCooBy} onChange={(e) => setForm((f) => ({ ...f, packToCooBy: e.target.value, packOverridden: true }))} /></Labelled>
      <Labelled label="Bid decision">
        <select className={input} value={form.bidDecision} onChange={(e) => setForm((f) => ({ ...f, bidDecision: e.target.value as '' | BidDecision }))}>
          <option value="">Undecided</option>
          {(Object.keys(BID_LABEL) as BidDecision[]).map((k) => <option key={k} value={k}>{BID_LABEL[k]}</option>)}
        </select>
      </Labelled>
      <Labelled label="Status">
        <input list="tender-statuses" className={input} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} />
        <datalist id="tender-statuses">{TENDER_STATUS_LABELS.map((s) => <option key={s} value={s} />)}</datalist>
      </Labelled>
      <Labelled label="Date sent to COO"><input type="date" className={input} value={form.dateSentToCoo} onChange={(e) => setForm((f) => ({ ...f, dateSentToCoo: e.target.value }))} /></Labelled>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.agpoReserved} onChange={(e) => setForm((f) => ({ ...f, agpoReserved: e.target.checked }))} />AGPO reserved</label>
      <div className="sm:col-span-4"><Labelled label="Notes"><input className={input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Labelled></div>
      <div className="flex justify-end gap-2 sm:col-span-4">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Log tender'}</button>
      </div>
    </form>
  );
}

function TenderRow({ tender: t, open, expanded, onToggle, onChange, onDeleted, onError }: {
  tender: TenderDto;
  open: boolean;
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
  const [status, setStatus] = useState(t.status);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { setStatus(t.status); }, [t.status]);
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

  const commitStatus = () => {
    const next = status.trim();
    if (!next || next === t.status) { setStatus(t.status); return; }
    if (tenderClosed(next) && !confirm(`Set “${t.title}” to “${next}”?`)) { setStatus(t.status); return; }
    void run({ status: next }, () => api.changeTenderStatus(t.id, { status: next }), 'Could not change the status');
  };

  return (
    <>
      <tr className="align-top hover:bg-cream/40">
        <td className="px-4 py-3">
          <div className="font-medium">{t.title}</div>
          <div className="text-xs text-charcoal-muted">
            {t.tenderRef} · {t.issuingOrg} · {TENDER_TYPE_LABEL[t.type]}{t.agpoReserved ? ' · AGPO' : ''}{t.sourcePortal ? ` · ${t.sourcePortal}` : ''}
          </div>
        </td>
        <td className="px-4 py-3">
          <input list={`statuses-${t.id}`} value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)} onBlur={commitStatus}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            className="w-40 rounded-lg border border-line bg-white px-2 py-1.5 text-xs" aria-label="Status" />
          <datalist id={`statuses-${t.id}`}>{TENDER_STATUS_LABELS.map((s) => <option key={s} value={s} />)}</datalist>
        </td>
        <td className="px-4 py-3">
          {t.dateSentToCoo ? (
            <span className={`rounded-full px-2 py-0.5 text-xs ${t.sentOnTime ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`} title={`Pack was due ${t.packToCooBy}`}>
              Sent {dateOnly(t.dateSentToCoo)} · {t.sentOnTime ? 'on time' : 'late'}
            </span>
          ) : (
            <Countdown days={t.daysToPack} date={t.packToCooBy} open={open} label="Pack" />
          )}
        </td>
        <td className="px-4 py-3"><Countdown days={t.daysToDeadline} date={t.submissionDeadline} open={open} label="Due" /></td>
        <td className="px-4 py-3 text-xs">{t.bidDecision ? BID_LABEL[t.bidDecision] : <span className="text-charcoal-muted">—</span>}</td>
        <td className="px-4 py-3 text-right"><button className={btnGhost} onClick={onToggle}>{expanded ? '▲ Hide' : '▼ Details'}</button></td>
      </tr>
      {expanded && (
        <tr className="bg-cream/40">
          <td colSpan={6} className="px-4 py-4">
            {editing ? (
              <TenderForm initial={t} onCancel={() => setEditing(false)} onSaved={(u) => { setEditing(false); onChange(u); setReloadKey((k) => k + 1); }} onError={onError} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row k="Date found" v={dateOnly(t.dateFound)} />
                    <Row k="Pack to COO by" v={`${dateOnly(t.packToCooBy)} · 5 pm`} />
                    <Row k="Submission deadline" v={dateOnly(t.submissionDeadline)} />
                    <Row k="Sent to COO" v={t.dateSentToCoo ? `${dateOnly(t.dateSentToCoo)} (${t.sentOnTime ? 'on time' : 'late'})` : '—'} />
                    <Row k="Bid decision" v={t.bidDecision ? BID_LABEL[t.bidDecision] : 'Undecided'} />
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
