'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AssetDto,
  AssetCategory,
  AssetCondition,
  InvestmentDto,
  InvestmentKind,
  MarketingChannel,
  MarketingSpendDto,
  ProfitDistributionDto,
  RevenueBreakdown,
  RevenueBreakdownItem,
  UnreconciledItem,
} from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { downloadCsv, csvMoney } from '../../../src/lib/csv';

// ── Shared helpers ──────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function label(value: string) {
  const spaced = value.replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const CHANNELS: MarketingChannel[] = [
  'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'GOOGLE', 'WHATSAPP', 'FLYERS', 'RADIO', 'REFERRAL', 'OTHER',
];
const ASSET_CATEGORIES: AssetCategory[] = ['MACHINE', 'VEHICLE', 'EQUIPMENT', 'TOOL', 'IT', 'FURNITURE', 'OTHER'];
const ASSET_CONDITIONS: AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'];
const INVESTMENT_KINDS: InvestmentKind[] = ['CAPITAL_INJECTION', 'LOAN', 'GRANT', 'OTHER'];

type Tab = 'revenue' | 'marketing' | 'assets' | 'investments' | 'sharing' | 'receipts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'assets', label: 'Assets' },
  { key: 'investments', label: 'Investments' },
  { key: 'sharing', label: 'Profit sharing' },
  { key: 'receipts', label: 'Receipts' },
];

const input = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted';

/** Who entered a record and when — the trust line on every finance row. */
function Provenance({ by, at }: { by: string | null; at: string }) {
  return (
    <span className="text-xs text-text-muted">
      Added by {by ?? 'unknown'} · {new Date(at).toLocaleDateString('en-KE')}
    </span>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const session = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('revenue');
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? `${fallback} (${err.status}).` : fallback);

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Finance</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every entry carries a source reference and shows who recorded it.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} w-auto`} />
          <span className="text-text-muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} w-auto`} />
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ key, label: text }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === key
                ? 'border-gold-deep font-medium text-gold-deep'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === 'revenue' && <RevenueTab from={from} to={to} onError={fail} />}
      {tab === 'marketing' && <MarketingTab from={from} to={to} onError={fail} />}
      {tab === 'assets' && <AssetsTab onError={fail} />}
      {tab === 'investments' && <InvestmentsTab onError={fail} />}
      {tab === 'sharing' && <SharingTab onError={fail} />}
      {tab === 'receipts' && <ReceiptsTab from={from} to={to} onError={fail} />}
    </div>
  );
}

type TabProps = { onError: (err: unknown, fallback: string) => void };

// ── Revenue ─────────────────────────────────────────────────────────────────

function BreakdownList({ title, items }: { title: string; items: RevenueBreakdownItem[] }) {
  const max = Math.max(...items.map((i) => i.incomeCents), 1);
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-widest text-text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No income recorded in this range.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{item.label}</span>
                <span className="font-medium">{fmt(item.incomeCents)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.round((item.incomeCents / max) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-text-muted">{item.jobCount} job{item.jobCount === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevenueTab({ from, to, onError }: TabProps & { from: string; to: string }) {
  const [data, setData] = useState<RevenueBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await api.revenueBreakdown(from, to)).breakdown);
    } catch (err) {
      onError(err, 'Could not load revenue');
    } finally {
      setLoading(false);
    }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Empty>Loading…</Empty>;
  if (!data) return null;

  const exportRows = [
    ...data.byServiceLine.map((i) => ({ dim: 'Service line', ...i })),
    ...data.byRegion.map((i) => ({ dim: 'Region', ...i })),
    ...data.bySegment.map((i) => ({ dim: 'Segment', ...i })),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Total income <span className="font-medium text-success">{fmt(data.totalIncomeCents)}</span> for{' '}
          {data.fromDate} → {data.toDate}
        </p>
        <button
          className={btnGhost}
          onClick={() =>
            downloadCsv(`revenue-${data.fromDate}-to-${data.toDate}`, [
              { header: 'Dimension', value: (r: (typeof exportRows)[number]) => r.dim },
              { header: 'Value', value: (r) => r.label },
              { header: 'Income (KSh)', value: (r) => csvMoney(r.incomeCents) },
              { header: 'Jobs', value: (r) => r.jobCount },
            ], exportRows)
          }
        >
          Export CSV
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownList title="By service line" items={data.byServiceLine} />
        <BreakdownList title="By region" items={data.byRegion} />
        <BreakdownList title="By client segment" items={data.bySegment} />
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Jobs recorded before these fields existed show as “Unclassified”. Set the service line, region and segment on
        a job to break its revenue out here.
      </p>
    </div>
  );
}

// ── Marketing ───────────────────────────────────────────────────────────────

function MarketingTab({ from, to, onError }: TabProps & { from: string; to: string }) {
  const [rows, setRows] = useState<MarketingSpendDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    campaign: '', channel: 'FACEBOOK' as MarketingChannel, amountKes: '', date: todayIso(),
    leads: '', bookings: '', receiptRef: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.marketingSpends(from, to)).spends);
    } catch (err) {
      onError(err, 'Could not load marketing spend');
    } finally {
      setLoading(false);
    }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amountKes);
    if (!form.campaign.trim() || !amount) return;
    setSaving(true);
    try {
      await api.addMarketingSpend({
        campaign: form.campaign.trim(),
        channel: form.channel,
        amountCents: Math.round(amount * 100),
        date: form.date,
        leadsCount: form.leads ? Number(form.leads) : undefined,
        bookingsCount: form.bookings ? Number(form.bookings) : undefined,
        receiptRef: form.receiptRef.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm({ ...form, campaign: '', amountKes: '', leads: '', bookings: '', receiptRef: '', notes: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      onError(err, 'Could not save marketing spend');
    } finally {
      setSaving(false);
    }
  };

  const total = rows.reduce((acc, r) => acc + r.amountCents, 0);
  const bookings = rows.reduce((acc, r) => acc + (r.bookingsCount ?? 0), 0);

  return (
    <div>
      <Toolbar
        summary={`${rows.length} campaign${rows.length === 1 ? '' : 's'} · ${fmt(total)} spent${
          bookings > 0 ? ` · ${bookings} bookings attributed` : ''
        }`}
        onExport={() =>
          downloadCsv(`marketing-${from}-to-${to}`, [
            { header: 'Date', value: (r: MarketingSpendDto) => r.date },
            { header: 'Campaign', value: (r) => r.campaign },
            { header: 'Channel', value: (r) => label(r.channel) },
            { header: 'Amount (KSh)', value: (r) => csvMoney(r.amountCents) },
            { header: 'Leads', value: (r) => r.leadsCount ?? '' },
            { header: 'Bookings', value: (r) => r.bookingsCount ?? '' },
            { header: 'Cost per booking (KSh)', value: (r) => (r.costPerBookingCents ? csvMoney(r.costPerBookingCents) : '') },
            { header: 'Receipt ref', value: (r) => r.receiptRef ?? '' },
            { header: 'Recorded by', value: (r) => r.createdByName ?? '' },
          ], rows)
        }
        onToggleForm={() => setShowForm((v) => !v)}
        formOpen={showForm}
        addLabel="campaign"
      />

      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-gold bg-gold-soft/10 p-5 sm:grid-cols-3">
          <Labelled label="Campaign">
            <input required className={input} value={form.campaign} placeholder="e.g. April home cleaning push"
              onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))} />
          </Labelled>
          <Labelled label="Channel">
            <select className={input} value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as MarketingChannel }))}>
              {CHANNELS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Labelled>
          <Labelled label="Amount (KSh)">
            <input required type="number" min="1" className={input} value={form.amountKes}
              onChange={(e) => setForm((f) => ({ ...f, amountKes: e.target.value }))} />
          </Labelled>
          <Labelled label="Date">
            <input required type="date" className={input} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Labelled>
          <Labelled label="Leads (optional)">
            <input type="number" min="0" className={input} value={form.leads}
              onChange={(e) => setForm((f) => ({ ...f, leads: e.target.value }))} />
          </Labelled>
          <Labelled label="Bookings (optional)">
            <input type="number" min="0" className={input} value={form.bookings}
              onChange={(e) => setForm((f) => ({ ...f, bookings: e.target.value }))} />
          </Labelled>
          <Labelled label="Receipt / invoice ref">
            <input className={input} value={form.receiptRef} placeholder="M-Pesa code or invoice no."
              onChange={(e) => setForm((f) => ({ ...f, receiptRef: e.target.value }))} />
          </Labelled>
          <div className="sm:col-span-2">
            <Labelled label="Notes">
              <input className={input} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Labelled>
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : 'Add campaign'}</button>
          </div>
        </form>
      )}

      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>No marketing spend recorded in this range.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-muted/30 text-xs uppercase tracking-widest text-text-muted">
                <Th>Date</Th><Th>Campaign</Th><Th>Channel</Th>
                <Th right>Spend</Th><Th right>Leads</Th><Th right>Bookings</Th><Th right>Cost / booking</Th><Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg-muted/30">
                  <Td>{r.date}</Td>
                  <Td>
                    <div>{r.campaign}</div>
                    <Provenance by={r.createdByName} at={r.createdAt} />
                    {r.receiptRef && <div className="text-xs text-text-muted">Ref {r.receiptRef}</div>}
                  </Td>
                  <Td>{label(r.channel)}</Td>
                  <Td right className="font-medium">{fmt(r.amountCents)}</Td>
                  <Td right>{r.leadsCount ?? '—'}</Td>
                  <Td right>{r.bookingsCount ?? '—'}</Td>
                  <Td right>{r.costPerBookingCents ? fmt(r.costPerBookingCents) : '—'}</Td>
                  <Td right>
                    <button
                      className="text-xs text-danger hover:underline"
                      onClick={async () => {
                        if (!confirm(`Delete "${r.campaign}"?`)) return;
                        try { await api.deleteMarketingSpend(r.id); await load(); }
                        catch (err) { onError(err, 'Could not delete'); }
                      }}
                    >Delete</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Assets ──────────────────────────────────────────────────────────────────

function AssetsTab({ onError }: TabProps) {
  const [rows, setRows] = useState<AssetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'MACHINE' as AssetCategory, purchaseDate: todayIso(), costKes: '',
    supplier: '', usefulLifeMonths: '', salvageKes: '', condition: 'GOOD' as AssetCondition, receiptRef: '',
  });
  const [maint, setMaint] = useState({ date: todayIso(), description: '', costKes: '', performedBy: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.assets()).assets);
    } catch (err) {
      onError(err, 'Could not load assets');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cost = parseFloat(form.costKes);
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.addAsset({
        name: form.name.trim(),
        category: form.category,
        purchaseDate: form.purchaseDate,
        costCents: Math.round((cost || 0) * 100),
        supplier: form.supplier.trim() || undefined,
        usefulLifeMonths: form.usefulLifeMonths ? Number(form.usefulLifeMonths) : undefined,
        salvageValueCents: form.salvageKes ? Math.round(parseFloat(form.salvageKes) * 100) : undefined,
        condition: form.condition,
        receiptRef: form.receiptRef.trim() || undefined,
      });
      setForm({ ...form, name: '', costKes: '', supplier: '', usefulLifeMonths: '', salvageKes: '', receiptRef: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      onError(err, 'Could not save asset');
    } finally {
      setSaving(false);
    }
  };

  const totalCost = rows.reduce((a, r) => a + r.costCents, 0);
  const totalBook = rows.reduce((a, r) => a + r.bookValueCents, 0);

  return (
    <div>
      <Toolbar
        summary={`${rows.length} asset${rows.length === 1 ? '' : 's'} · ${fmt(totalCost)} at cost · ${fmt(totalBook)} book value`}
        onExport={() =>
          downloadCsv('asset-register', [
            { header: 'Name', value: (r: AssetDto) => r.name },
            { header: 'Category', value: (r) => label(r.category) },
            { header: 'Purchased', value: (r) => r.purchaseDate },
            { header: 'Cost (KSh)', value: (r) => csvMoney(r.costCents) },
            { header: 'Useful life (months)', value: (r) => r.usefulLifeMonths ?? '' },
            { header: 'Depreciation to date (KSh)', value: (r) => csvMoney(r.accumulatedDepreciationCents) },
            { header: 'Book value (KSh)', value: (r) => csvMoney(r.bookValueCents) },
            { header: 'Condition', value: (r) => label(r.condition) },
            { header: 'Maintenance spend (KSh)', value: (r) => csvMoney(r.totalMaintenanceCents) },
            { header: 'Receipt ref', value: (r) => r.receiptRef ?? '' },
          ], rows)
        }
        onToggleForm={() => setShowForm((v) => !v)}
        formOpen={showForm}
        addLabel="asset"
      />

      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-gold bg-gold-soft/10 p-5 sm:grid-cols-3">
          <Labelled label="Name">
            <input required className={input} value={form.name} placeholder="e.g. Karcher extractor"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Labelled>
          <Labelled label="Category">
            <select className={input} value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AssetCategory }))}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Labelled>
          <Labelled label="Cost (KSh)">
            <input required type="number" min="0" className={input} value={form.costKes}
              onChange={(e) => setForm((f) => ({ ...f, costKes: e.target.value }))} />
          </Labelled>
          <Labelled label="Purchase date">
            <input required type="date" className={input} value={form.purchaseDate}
              onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
          </Labelled>
          <Labelled label="Useful life (months)" hint="Leave blank to skip depreciation">
            <input type="number" min="1" className={input} value={form.usefulLifeMonths} placeholder="e.g. 60"
              onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))} />
          </Labelled>
          <Labelled label="Salvage value (KSh)">
            <input type="number" min="0" className={input} value={form.salvageKes}
              onChange={(e) => setForm((f) => ({ ...f, salvageKes: e.target.value }))} />
          </Labelled>
          <Labelled label="Supplier">
            <input className={input} value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
          </Labelled>
          <Labelled label="Condition">
            <select className={input} value={form.condition}
              onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value as AssetCondition }))}>
              {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Labelled>
          <Labelled label="Receipt ref">
            <input className={input} value={form.receiptRef}
              onChange={(e) => setForm((f) => ({ ...f, receiptRef: e.target.value }))} />
          </Labelled>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : 'Add asset'}</button>
          </div>
        </form>
      )}

      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>No assets on the register yet.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">{label(r.category)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      r.condition === 'RETIRED' ? 'bg-danger/10 text-danger'
                        : r.condition === 'POOR' ? 'bg-warning/15 text-warning'
                        : 'bg-success/10 text-success'
                    }`}>{label(r.condition)}</span>
                  </div>
                  <div className="mt-1 text-xs text-text-muted">
                    Bought {r.purchaseDate}{r.supplier ? ` from ${r.supplier}` : ''}
                    {r.receiptRef ? ` · Ref ${r.receiptRef}` : ''}
                  </div>
                  <div className="mt-0.5"><Provenance by={r.createdByName} at={r.createdAt} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-5 text-sm">
                  <Stat label="Cost" value={fmt(r.costCents)} />
                  <Stat label="Depreciated" value={fmt(r.accumulatedDepreciationCents)} tone="text-danger" />
                  <Stat label="Book value" value={fmt(r.bookValueCents)} tone="text-success" />
                  {r.totalMaintenanceCents > 0 && <Stat label="Maintenance" value={fmt(r.totalMaintenanceCents)} />}
                  <button className={btnGhost} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    {expanded === r.id ? '▲ Hide' : `▼ Maintenance (${r.maintenance.length})`}
                  </button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="border-t border-border bg-bg-muted/20 px-5 py-4">
                  {r.maintenance.length > 0 ? (
                    <ul className="mb-4 space-y-2">
                      {r.maintenance.map((m) => (
                        <li key={m.id} className="flex flex-wrap justify-between gap-3 text-sm">
                          <span>
                            <span className="text-text-muted">{m.date}</span> — {m.description}
                            {m.performedBy ? ` (${m.performedBy})` : ''}
                          </span>
                          <span className="font-medium">{fmt(m.costCents)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-4 text-sm text-text-muted">No maintenance logged yet.</p>
                  )}

                  <form
                    className="grid gap-3 sm:grid-cols-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!maint.description.trim()) return;
                      try {
                        await api.addAssetMaintenance(r.id, {
                          date: maint.date,
                          description: maint.description.trim(),
                          costCents: maint.costKes ? Math.round(parseFloat(maint.costKes) * 100) : undefined,
                          performedBy: maint.performedBy.trim() || undefined,
                        });
                        setMaint({ date: todayIso(), description: '', costKes: '', performedBy: '' });
                        await load();
                      } catch (err) { onError(err, 'Could not log maintenance'); }
                    }}
                  >
                    <input type="date" className={input} value={maint.date}
                      onChange={(e) => setMaint((m) => ({ ...m, date: e.target.value }))} />
                    <input className={input} placeholder="What was done" value={maint.description}
                      onChange={(e) => setMaint((m) => ({ ...m, description: e.target.value }))} />
                    <input type="number" min="0" className={input} placeholder="Cost (KSh)" value={maint.costKes}
                      onChange={(e) => setMaint((m) => ({ ...m, costKes: e.target.value }))} />
                    <div className="flex gap-2">
                      <input className={input} placeholder="By whom" value={maint.performedBy}
                        onChange={(e) => setMaint((m) => ({ ...m, performedBy: e.target.value }))} />
                      <button type="submit" className={btn}>Log</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Investments ─────────────────────────────────────────────────────────────

function InvestmentsTab({ onError }: TabProps) {
  const [rows, setRows] = useState<InvestmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    source: '', kind: 'CAPITAL_INJECTION' as InvestmentKind, amountKes: '', date: todayIso(),
    purpose: '', reference: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.investments()).investments);
    } catch (err) {
      onError(err, 'Could not load investments');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const total = rows.reduce((a, r) => a + r.amountCents, 0);

  return (
    <div>
      <Toolbar
        summary={`${rows.length} record${rows.length === 1 ? '' : 's'} · ${fmt(total)} invested`}
        onExport={() =>
          downloadCsv('investments', [
            { header: 'Date', value: (r: InvestmentDto) => r.date },
            { header: 'Source', value: (r) => r.source },
            { header: 'Type', value: (r) => label(r.kind) },
            { header: 'Amount (KSh)', value: (r) => csvMoney(r.amountCents) },
            { header: 'Purpose', value: (r) => r.purpose },
            { header: 'Reference', value: (r) => r.reference ?? '' },
            { header: 'Recorded by', value: (r) => r.createdByName ?? '' },
          ], rows)
        }
        onToggleForm={() => setShowForm((v) => !v)}
        formOpen={showForm}
        addLabel="investment"
      />

      {showForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const amount = parseFloat(form.amountKes);
            if (!form.source.trim() || !amount || !form.purpose.trim()) return;
            setSaving(true);
            try {
              await api.addInvestment({
                source: form.source.trim(),
                kind: form.kind,
                amountCents: Math.round(amount * 100),
                date: form.date,
                purpose: form.purpose.trim(),
                reference: form.reference.trim() || undefined,
              });
              setForm({ ...form, source: '', amountKes: '', purpose: '', reference: '' });
              setShowForm(false);
              await load();
            } catch (err) { onError(err, 'Could not save investment'); }
            finally { setSaving(false); }
          }}
          className="mb-4 grid gap-3 rounded-xl border border-gold bg-gold-soft/10 p-5 sm:grid-cols-3"
        >
          <Labelled label="Source">
            <input required className={input} value={form.source} placeholder="Who provided the funds"
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
          </Labelled>
          <Labelled label="Type">
            <select className={input} value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as InvestmentKind }))}>
              {INVESTMENT_KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
            </select>
          </Labelled>
          <Labelled label="Amount (KSh)">
            <input required type="number" min="1" className={input} value={form.amountKes}
              onChange={(e) => setForm((f) => ({ ...f, amountKes: e.target.value }))} />
          </Labelled>
          <Labelled label="Date">
            <input required type="date" className={input} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Labelled>
          <div className="sm:col-span-2">
            <Labelled label="Purpose">
              <input required className={input} value={form.purpose} placeholder="What the money is for"
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
            </Labelled>
          </div>
          <Labelled label="Reference">
            <input className={input} value={form.reference} placeholder="M-Pesa / bank ref"
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </Labelled>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : 'Add investment'}</button>
          </div>
        </form>
      )}

      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>No capital injections recorded yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-muted/30 text-xs uppercase tracking-widest text-text-muted">
                <Th>Date</Th><Th>Source</Th><Th>Type</Th><Th>Purpose</Th><Th right>Amount</Th><Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg-muted/30">
                  <Td>{r.date}</Td>
                  <Td>
                    <div>{r.source}</div>
                    <Provenance by={r.createdByName} at={r.createdAt} />
                  </Td>
                  <Td>{label(r.kind)}</Td>
                  <Td>
                    {r.purpose}
                    {r.reference && <div className="text-xs text-text-muted">Ref {r.reference}</div>}
                  </Td>
                  <Td right className="font-medium">{fmt(r.amountCents)}</Td>
                  <Td right>
                    <button className="text-xs text-danger hover:underline"
                      onClick={async () => {
                        if (!confirm(`Delete investment from ${r.source}?`)) return;
                        try { await api.deleteInvestment(r.id); await load(); }
                        catch (err) { onError(err, 'Could not delete'); }
                      }}>Delete</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Profit sharing ──────────────────────────────────────────────────────────

function SharingTab({ onError }: TabProps) {
  const [rows, setRows] = useState<ProfitDistributionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: '', periodStart: monthStartIso(), periodEnd: todayIso() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.distributions()).distributions);
    } catch (err) {
      onError(err, 'Could not load distributions');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  // Group by declared period so each declaration reads as one block.
  const periods = new Map<string, ProfitDistributionDto[]>();
  for (const row of rows) {
    const key = `${row.periodStart}|${row.periodEnd}|${row.label}`;
    periods.set(key, [...(periods.get(key) ?? []), row]);
  }

  return (
    <div>
      <Toolbar
        summary={`${periods.size} declared period${periods.size === 1 ? '' : 's'}`}
        onExport={() =>
          downloadCsv('profit-distributions', [
            { header: 'Period', value: (r: ProfitDistributionDto) => r.label },
            { header: 'From', value: (r) => r.periodStart },
            { header: 'To', value: (r) => r.periodEnd },
            { header: 'Shareholder', value: (r) => r.shareholderName },
            { header: 'Stake (%)', value: (r) => (r.basisPoints / 100).toFixed(2) },
            { header: 'Net profit (KSh)', value: (r) => csvMoney(r.netProfitCents) },
            { header: 'Share (KSh)', value: (r) => csvMoney(r.amountCents) },
            { header: 'Status', value: (r) => label(r.status) },
            { header: 'Paid at', value: (r) => (r.paidAt ? r.paidAt.slice(0, 10) : '') },
            { header: 'Reference', value: (r) => r.reference ?? '' },
          ], rows)
        }
        onToggleForm={() => setShowForm((v) => !v)}
        formOpen={showForm}
        addLabel="declaration"
      />

      {showForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.label.trim()) return;
            setSaving(true);
            try {
              await api.declareDistribution({
                label: form.label.trim(),
                periodStart: form.periodStart,
                periodEnd: form.periodEnd,
              });
              setForm({ label: '', periodStart: monthStartIso(), periodEnd: todayIso() });
              setShowForm(false);
              await load();
            } catch (err) { onError(err, 'Could not declare period'); }
            finally { setSaving(false); }
          }}
          className="mb-4 grid gap-3 rounded-xl border border-gold bg-gold-soft/10 p-5 sm:grid-cols-4"
        >
          <Labelled label="Period name">
            <input required className={input} value={form.label} placeholder="e.g. Q1 2026"
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </Labelled>
          <Labelled label="From">
            <input required type="date" className={input} value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
          </Labelled>
          <Labelled label="To">
            <input required type="date" className={input} value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
          </Labelled>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Calculating…' : 'Declare'}</button>
          </div>
          <p className="text-xs text-text-muted sm:col-span-4">
            Net profit for the period is calculated from approved jobs and their expenses, then split by the current
            cap table. The stake and profit figure are frozen on the record, so later cap-table edits never rewrite a
            declared payout.
          </p>
        </form>
      )}

      {loading ? <Empty>Loading…</Empty> : periods.size === 0 ? (
        <Empty>No periods declared yet. Declare one to split a period’s profit across the cap table.</Empty>
      ) : (
        <div className="space-y-4">
          {[...periods.entries()].map(([key, items]) => {
            const first = items[0]!;
            const paid = items.filter((i) => i.status === 'PAID').length;
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-muted/30 px-5 py-3">
                  <div>
                    <span className="font-medium">{first.label}</span>
                    <span className="ml-2 text-xs text-text-muted">{first.periodStart} → {first.periodEnd}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-text-muted">Net profit </span>
                    <span className={first.netProfitCents >= 0 ? 'font-medium text-success' : 'font-medium text-danger'}>
                      {fmt(first.netProfitCents)}
                    </span>
                    <span className="ml-3 text-xs text-text-muted">{paid}/{items.length} paid</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {items.map((r) => (
                      <tr key={r.id} className="hover:bg-bg-muted/30">
                        <Td>
                          <div className="font-medium">{r.shareholderName}</div>
                          <span className="text-xs text-text-muted">{(r.basisPoints / 100).toFixed(2)}% stake</span>
                        </Td>
                        <Td right className="font-medium">{fmt(r.amountCents)}</Td>
                        <Td>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            r.status === 'PAID' ? 'bg-success/10 text-success'
                              : r.status === 'CANCELLED' ? 'bg-danger/10 text-danger'
                              : 'bg-warning/15 text-warning'
                          }`}>{label(r.status)}</span>
                          {r.reference && <span className="ml-2 text-xs text-text-muted">Ref {r.reference}</span>}
                        </Td>
                        <Td right>
                          {r.status !== 'PAID' ? (
                            <button
                              className={btnGhost}
                              onClick={async () => {
                                const reference = prompt(`Payment reference for ${r.shareholderName} (M-Pesa or bank):`);
                                if (reference === null) return;
                                try {
                                  await api.updateDistribution(r.id, { status: 'PAID', reference: reference.trim() || undefined });
                                  await load();
                                } catch (err) { onError(err, 'Could not mark paid'); }
                              }}
                            >Mark paid</button>
                          ) : (
                            <span className="text-xs text-text-muted">
                              {r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-KE') : ''}
                            </span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Receipts & reconciliation ───────────────────────────────────────────────

function ReceiptsTab({ from, to, onError }: TabProps & { from: string; to: string }) {
  const [items, setItems] = useState<UnreconciledItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.unreconciled(from, to)).items);
    } catch (err) {
      onError(err, 'Could not load reconciliation');
    } finally {
      setLoading(false);
    }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  const missingReceipt = items.filter((i) => !i.hasReceipt).length;

  return (
    <div>
      <Toolbar
        summary={`${items.length} unreconciled · ${missingReceipt} with no source document`}
        onExport={() =>
          downloadCsv(`unreconciled-${from}-to-${to}`, [
            { header: 'Date', value: (r: UnreconciledItem) => r.date },
            { header: 'Type', value: (r) => label(r.kind) },
            { header: 'Description', value: (r) => r.description },
            { header: 'Amount (KSh)', value: (r) => csvMoney(r.amountCents) },
            { header: 'Has receipt', value: (r) => (r.hasReceipt ? 'yes' : 'no') },
          ], items)
        }
      />

      {loading ? <Empty>Loading…</Empty> : items.length === 0 ? (
        <Empty>Everything in this range is reconciled. </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-muted/30 text-xs uppercase tracking-widest text-text-muted">
                <Th>Date</Th><Th>Type</Th><Th>Description</Th><Th right>Amount</Th><Th>Source doc</Th><Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="hover:bg-bg-muted/30">
                  <Td>{r.date}</Td>
                  <Td>{label(r.kind)}</Td>
                  <Td>{r.description}</Td>
                  <Td right className="font-medium">{fmt(r.amountCents)}</Td>
                  <Td>
                    {r.hasReceipt ? (
                      <span className="text-xs text-success">Attached</span>
                    ) : (
                      <button
                        className="text-xs text-gold-deep hover:underline"
                        onClick={async () => {
                          const ref = prompt('Receipt / M-Pesa reference:');
                          if (!ref?.trim()) return;
                          try { await api.reconcile(r.kind, r.id, { receiptRef: ref.trim() }); await load(); }
                          catch (err) { onError(err, 'Could not attach reference'); }
                        }}
                      >Add reference</button>
                    )}
                  </Td>
                  <Td right>
                    <button
                      className={btnGhost}
                      onClick={async () => {
                        try { await api.reconcile(r.kind, r.id, { reconciled: true }); await load(); }
                        catch (err) { onError(err, 'Could not reconcile'); }
                      }}
                    >Mark reconciled</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────

function Toolbar({
  summary, onExport, onToggleForm, formOpen, addLabel,
}: {
  summary: string;
  onExport: () => void;
  onToggleForm?: () => void;
  formOpen?: boolean;
  addLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-text-muted">{summary}</span>
      <div className="flex items-center gap-2">
        <button className={btnGhost} onClick={onExport}>Export CSV</button>
        {onToggleForm && (
          <button className={btn} onClick={onToggleForm}>
            {formOpen ? 'Cancel' : `+ New ${addLabel}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Labelled({ label: text, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-muted">{text}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Stat({ label: text, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-xs text-text-muted">{text} </span>
      <span className={`font-medium ${tone ?? ''}`}>{value}</span>
    </span>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-5 py-3 font-normal ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-5 py-3 ${right ? 'text-right' : ''} ${className ?? ''}`}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}
