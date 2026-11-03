'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
  ShareholderDto,
  UnreconciledItem,
} from '@onyxhawk/types';

import { RankedBars, type RankedItem } from '../../../src/components/charts';
import { DataTable, TableToolbar, useTableControls, type Column } from '../../../src/components/DataTable';
import { api, ApiError } from '../../../src/lib/api';
import { useConfirm } from '../../../src/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../src/components/ui/tabs';
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

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** A ranked bar's share of its chart's total, as the bar prints it. */
function sharePercent(share: number) {
  return `${Math.round(share * 100)}%`;
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
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
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
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Finance</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every entry carries a source reference and shows who recorded it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
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

      <TabsList>
        {TABS.map(({ key, label: text }) => (
          <TabsTrigger key={key} value={key}>
            {text}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="revenue"><RevenueTab from={from} to={to} onError={fail} /></TabsContent>
      <TabsContent value="marketing"><MarketingTab from={from} to={to} onError={fail} /></TabsContent>
      <TabsContent value="assets"><AssetsTab onError={fail} /></TabsContent>
      <TabsContent value="investments"><InvestmentsTab onError={fail} isOwner={session.user.isOwner === true} /></TabsContent>
      <TabsContent value="sharing"><SharingTab onError={fail} isOwner={session.user.isOwner === true} /></TabsContent>
      <TabsContent value="receipts"><ReceiptsTab from={from} to={to} onError={fail} /></TabsContent>
    </Tabs>
  );
}

type TabProps = { onError: (err: unknown, fallback: string) => void };

// ── Revenue ─────────────────────────────────────────────────────────────────

/** One dimension's income as ranked bars; hovering or tapping a row shows its income, jobs and share. */
function BreakdownBars({ title, items }: { title: string; items: RevenueBreakdownItem[] }) {
  const jobs = new Map(items.map((i) => [i.key, i.jobCount]));
  return (
    <RankedBars
      title={title}
      items={items.map((i) => ({ key: i.key, label: i.label, value: i.incomeCents, sub: plural(i.jobCount, 'job') }))}
      format={fmt}
      emptyLabel="No income recorded in this range."
      detail={(item, share) =>
        `${fmt(item.value)} · ${plural(jobs.get(item.key) ?? 0, 'job')} · ${sharePercent(share)} of income`
      }
    />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownBars title="By service line" items={data.byServiceLine} />
        <BreakdownBars title="By region" items={data.byRegion} />
        <BreakdownBars title="By client segment" items={data.bySegment} />
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
  const confirm = useConfirm();
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

  // Columns run in the export's order; the receipt ref and recorder are export- and search-only.
  const columns: Column<MarketingSpendDto>[] = [
    { header: 'Date', cell: (r) => r.date, sort: (r) => r.date, search: (r) => r.date, csv: (r) => r.date },
    {
      header: 'Campaign',
      cell: (r) => (
        <>
          <div>{r.campaign}</div>
          <Provenance by={r.createdByName} at={r.createdAt} />
          {r.receiptRef && <div className="text-xs text-text-muted">Ref {r.receiptRef}</div>}
        </>
      ),
      sort: (r) => r.campaign,
      search: (r) => r.campaign,
      csv: (r) => r.campaign,
    },
    {
      header: 'Channel',
      cell: (r) => label(r.channel),
      sort: (r) => label(r.channel),
      search: (r) => label(r.channel),
      csv: (r) => label(r.channel),
    },
    {
      header: 'Spend',
      csvHeader: 'Amount (KSh)',
      right: true,
      className: 'font-medium',
      cell: (r) => fmt(r.amountCents),
      sort: (r) => r.amountCents,
      csv: (r) => csvMoney(r.amountCents),
    },
    { header: 'Leads', right: true, cell: (r) => r.leadsCount ?? '—', sort: (r) => r.leadsCount, csv: (r) => r.leadsCount ?? '' },
    {
      header: 'Bookings',
      right: true,
      cell: (r) => r.bookingsCount ?? '—',
      sort: (r) => r.bookingsCount,
      csv: (r) => r.bookingsCount ?? '',
    },
    {
      header: 'Cost / booking',
      csvHeader: 'Cost per booking (KSh)',
      right: true,
      cell: (r) => (r.costPerBookingCents ? fmt(r.costPerBookingCents) : '—'),
      sort: (r) => r.costPerBookingCents,
      csv: (r) => (r.costPerBookingCents ? csvMoney(r.costPerBookingCents) : ''),
    },
    { header: 'Receipt ref', search: (r) => r.receiptRef, csv: (r) => r.receiptRef ?? '' },
    { header: 'Recorded by', search: (r) => r.createdByName, csv: (r) => r.createdByName ?? '' },
    {
      header: '',
      right: true,
      cell: (r) => (
        <button
          className="text-xs text-danger hover:underline"
          onClick={async () => {
            if (!(await confirm({ title: `Delete "${r.campaign}"?`, confirmLabel: 'Delete', destructive: true }))) return;
            try { await api.deleteMarketingSpend(r.id); await load(); toast.success(`Deleted "${r.campaign}"`); }
            catch (err) { onError(err, 'Could not delete'); }
          }}
        >Delete</button>
      ),
    },
  ];
  const controls = useTableControls(rows, columns);

  // Spend by channel, totalled from every loaded record (not just those matching the search).
  const channels = new Map<string, { cents: number; campaigns: number }>();
  for (const r of rows) {
    const tally = channels.get(r.channel) ?? { cents: 0, campaigns: 0 };
    channels.set(r.channel, { cents: tally.cents + r.amountCents, campaigns: tally.campaigns + 1 });
  }
  const channelBars: RankedItem[] = [...channels]
    .map(([channel, tally]) => ({ key: channel, label: label(channel), value: tally.cents }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <TableToolbar
        controls={controls}
        csv={{ filename: `marketing-${from}-to-${to}` }}
        summary={`${rows.length} campaign${rows.length === 1 ? '' : 's'} · ${fmt(total)} spent${
          bookings > 0 ? ` · ${bookings} bookings attributed` : ''
        }`}
      >
        <NewToggle open={showForm} onToggle={() => setShowForm((v) => !v)} what="campaign" />
      </TableToolbar>

      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-aqua/40 bg-white p-5 sm:grid-cols-3">
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
        <>
          <div className="mb-4 max-w-2xl">
            <RankedBars
              title="Spend by channel"
              items={channelBars}
              format={fmt}
              detail={(item, share) => {
                const campaigns = channels.get(item.key)?.campaigns ?? 0;
                return `${fmt(item.value)} · ${plural(campaigns, 'campaign')} · ${sharePercent(share)} of spend`;
              }}
            />
          </div>
          <DataTable controls={controls} rowKey={(r) => r.id} />
        </>
      )}
    </div>
  );
}

// ── Assets ──────────────────────────────────────────────────────────────────

/** The asset cards' fields for search, the sort choice and the register export, in the export's order. */
const ASSET_COLUMNS: Column<AssetDto>[] = [
  { header: 'Name', sort: (r) => r.name, search: (r) => r.name, csv: (r) => r.name },
  {
    header: 'Category',
    sort: (r) => label(r.category),
    search: (r) => label(r.category),
    csv: (r) => label(r.category),
  },
  { header: 'Purchased', sort: (r) => r.purchaseDate, search: (r) => r.purchaseDate, csv: (r) => r.purchaseDate },
  { header: 'Cost', csvHeader: 'Cost (KSh)', sort: (r) => r.costCents, csv: (r) => csvMoney(r.costCents) },
  { header: 'Useful life (months)', csv: (r) => r.usefulLifeMonths ?? '' },
  {
    header: 'Depreciated',
    csvHeader: 'Depreciation to date (KSh)',
    sort: (r) => r.accumulatedDepreciationCents,
    csv: (r) => csvMoney(r.accumulatedDepreciationCents),
  },
  { header: 'Book value', csvHeader: 'Book value (KSh)', sort: (r) => r.bookValueCents, csv: (r) => csvMoney(r.bookValueCents) },
  {
    header: 'Condition',
    // New to retired, not alphabetical.
    sort: (r) => ASSET_CONDITIONS.indexOf(r.condition),
    search: (r) => label(r.condition),
    csv: (r) => label(r.condition),
  },
  {
    header: 'Maintenance',
    csvHeader: 'Maintenance spend (KSh)',
    sort: (r) => r.totalMaintenanceCents,
    csv: (r) => csvMoney(r.totalMaintenanceCents),
  },
  { header: 'Receipt ref', search: (r) => r.receiptRef, csv: (r) => r.receiptRef ?? '' },
  { header: 'Supplier', search: (r) => r.supplier },
];

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

  const controls = useTableControls(rows, ASSET_COLUMNS);

  const totalCost = rows.reduce((a, r) => a + r.costCents, 0);
  const totalBook = rows.reduce((a, r) => a + r.bookValueCents, 0);

  return (
    <div>
      <TableToolbar
        controls={controls}
        csv={{ filename: 'asset-register' }}
        sortChoice
        summary={`${rows.length} asset${rows.length === 1 ? '' : 's'} · ${fmt(totalCost)} at cost · ${fmt(totalBook)} book value`}
      >
        <NewToggle open={showForm} onToggle={() => setShowForm((v) => !v)} what="asset" />
      </TableToolbar>

      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-xl border border-aqua/40 bg-white p-5 sm:grid-cols-3">
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
      ) : controls.rows.length === 0 ? (
        <Empty>No assets match “{controls.query.trim()}”.</Empty>
      ) : (
        <div className="space-y-3">
          {controls.rows.map((r) => (
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

function InvestmentsTab({ onError, isOwner }: TabProps & { isOwner: boolean }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<InvestmentDto[]>([]);
  const [holders, setHolders] = useState<ShareholderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    source: '', kind: 'CAPITAL_INJECTION' as InvestmentKind, amountKes: '', date: todayIso(),
    purpose: '', reference: '', shareholderId: '',
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

  // Only the owner links investments to holders, and only the owner may read the cap table.
  useEffect(() => {
    if (!isOwner) return;
    api.shareholders()
      .then((res) => setHolders(res.shareholders))
      .catch((err) => onError(err, 'Could not load shareholders'));
  }, [isOwner, onError]);

  // Saves on pick. The row takes the server's answer, so a failed save leaves the old holder showing.
  const linkHolder = async (r: InvestmentDto, shareholderId: string | null) => {
    setLinkingId(r.id);
    try {
      const { investment } = await api.updateInvestment(r.id, { shareholderId });
      setRows((prev) => prev.map((x) => (x.id === investment.id ? investment : x)));
    } catch (err) {
      onError(err, 'Could not link the investment');
    } finally {
      setLinkingId(null);
    }
  };

  const total = rows.reduce((a, r) => a + r.amountCents, 0);

  // Columns run in the export's order. The export has the amount before the purpose and no shareholder,
  // so its amount is an export-only column and the drawn Amount (last, as on screen) exports nothing.
  const columns: Column<InvestmentDto>[] = [
    { header: 'Date', cell: (r) => r.date, sort: (r) => r.date, search: (r) => r.date, csv: (r) => r.date },
    {
      header: 'Source',
      cell: (r) => (
        <>
          <div>{r.source}</div>
          <Provenance by={r.createdByName} at={r.createdAt} />
        </>
      ),
      sort: (r) => r.source,
      search: (r) => r.source,
      csv: (r) => r.source,
    },
    {
      header: 'Shareholder',
      cell: (r) =>
        isOwner ? (
          <select
            aria-label={`Shareholder for ${r.source}, ${r.date}`}
            className="rounded-lg border border-border bg-bg px-2 py-1.5 text-sm disabled:opacity-50"
            value={r.shareholderId ?? ''}
            disabled={linkingId === r.id}
            onChange={(e) => void linkHolder(r, e.target.value || null)}
          >
            <option value="">Not linked</option>
            {/* Keeps a holder the list could not supply visible rather than reading as unlinked. */}
            {r.shareholderId && !holders.some((h) => h.id === r.shareholderId) && (
              <option value={r.shareholderId}>{r.shareholderName ?? 'Unknown shareholder'}</option>
            )}
            {holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        ) : (
          r.shareholderName ?? '—'
        ),
      sort: (r) => r.shareholderName,
      search: (r) => r.shareholderName,
    },
    { header: 'Type', cell: (r) => label(r.kind), sort: (r) => label(r.kind), search: (r) => label(r.kind), csv: (r) => label(r.kind) },
    { header: 'Amount (KSh)', csv: (r) => csvMoney(r.amountCents) },
    {
      header: 'Purpose',
      cell: (r) => (
        <>
          {r.purpose}
          {r.reference && <div className="text-xs text-text-muted">Ref {r.reference}</div>}
        </>
      ),
      sort: (r) => r.purpose,
      search: (r) => r.purpose,
      csv: (r) => r.purpose,
    },
    { header: 'Reference', search: (r) => r.reference, csv: (r) => r.reference ?? '' },
    { header: 'Recorded by', search: (r) => r.createdByName, csv: (r) => r.createdByName ?? '' },
    { header: 'Amount', right: true, className: 'font-medium', cell: (r) => fmt(r.amountCents), sort: (r) => r.amountCents },
    {
      header: '',
      right: true,
      // Investment writes are owner-only, so only the owner gets Delete.
      cell: (r) => isOwner && (
        <button className="text-xs text-danger hover:underline"
          onClick={async () => {
            if (!(await confirm({ title: `Delete investment from ${r.source}?`, confirmLabel: 'Delete', destructive: true }))) return;
            try { await api.deleteInvestment(r.id); await load(); toast.success(`Deleted investment from ${r.source}`); }
            catch (err) { onError(err, 'Could not delete'); }
          }}>Delete</button>
      ),
    },
  ];
  const controls = useTableControls(rows, columns);

  return (
    <div>
      <TableToolbar
        controls={controls}
        csv={{ filename: 'investments' }}
        summary={`${rows.length} record${rows.length === 1 ? '' : 's'} · ${fmt(total)} invested`}
      >
        {isOwner && <NewToggle open={showForm} onToggle={() => setShowForm((v) => !v)} what="investment" />}
      </TableToolbar>

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
                shareholderId: form.shareholderId || null,
              });
              setForm({ ...form, source: '', amountKes: '', purpose: '', reference: '', shareholderId: '' });
              setShowForm(false);
              await load();
            } catch (err) { onError(err, 'Could not save investment'); }
            finally { setSaving(false); }
          }}
          className="mb-4 grid gap-3 rounded-xl border border-aqua/40 bg-white p-5 sm:grid-cols-3"
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
          {isOwner && (
            <Labelled label="Shareholder" hint="That shareholder will be able to see this record.">
              <select className={input} value={form.shareholderId}
                onChange={(e) => setForm((f) => ({ ...f, shareholderId: e.target.value }))}>
                <option value="">Not linked</option>
                {holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Labelled>
          )}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className={btn}>{saving ? 'Saving…' : 'Add investment'}</button>
          </div>
        </form>
      )}

      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>
          {isOwner
            ? 'No capital injections recorded yet.'
            : 'Only investments linked to your own holding show here; the owner records investments.'}
        </Empty>
      ) : (
        <DataTable controls={controls} rowKey={(r) => r.id} />
      )}
    </div>
  );
}

// ── Profit sharing ──────────────────────────────────────────────────────────

function SharingTab({ onError, isOwner }: TabProps & { isOwner: boolean }) {
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

  // One column list serves the tab's search and export and every period's table. It runs in the
  // export's order; the period, stake, net profit and reference are export- and search-only, as the
  // period card's header and the shareholder and status cells already show them.
  const columns: Column<ProfitDistributionDto>[] = [
    { header: 'Period', search: (r) => r.label, csv: (r) => r.label },
    { header: 'From', csv: (r) => r.periodStart },
    { header: 'To', csv: (r) => r.periodEnd },
    {
      header: 'Shareholder',
      cell: (r) => (
        <>
          <div className="font-medium">{r.shareholderName}</div>
          <span className="text-xs text-text-muted">{(r.basisPoints / 100).toFixed(2)}% stake</span>
        </>
      ),
      sort: (r) => r.shareholderName,
      search: (r) => r.shareholderName,
      csv: (r) => r.shareholderName,
    },
    { header: 'Stake (%)', csv: (r) => (r.basisPoints / 100).toFixed(2) },
    { header: 'Net profit (KSh)', csv: (r) => csvMoney(r.netProfitCents) },
    {
      header: 'Share',
      csvHeader: 'Share (KSh)',
      right: true,
      className: 'font-medium',
      cell: (r) => fmt(r.amountCents),
      sort: (r) => r.amountCents,
      csv: (r) => csvMoney(r.amountCents),
    },
    {
      header: 'Status',
      cell: (r) => (
        <>
          <span className={`rounded-full px-2 py-0.5 text-xs ${
            r.status === 'PAID' ? 'bg-success/10 text-success'
              : r.status === 'CANCELLED' ? 'bg-danger/10 text-danger'
              : 'bg-warning/15 text-warning'
          }`}>{label(r.status)}</span>
          {r.reference && <span className="ml-2 text-xs text-text-muted">Ref {r.reference}</span>}
        </>
      ),
      sort: (r) => label(r.status),
      search: (r) => label(r.status),
      csv: (r) => label(r.status),
    },
    {
      // The paid date, or Mark paid for the owner while unpaid. Sort and export read the date, never the button.
      header: 'Paid on',
      csvHeader: 'Paid at',
      right: true,
      cell: (r) =>
        r.status !== 'PAID' && isOwner ? (
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
        ),
      sort: (r) => r.paidAt,
      csv: (r) => (r.paidAt ? r.paidAt.slice(0, 10) : ''),
    },
    { header: 'Reference', search: (r) => r.reference, csv: (r) => r.reference ?? '' },
  ];
  // The tab's search box and all-periods export; each period's table follows its search.
  const controls = useTableControls(rows, columns);

  // Group by declared period so each declaration reads as one block.
  const periodKey = (r: ProfitDistributionDto) => `${r.periodStart}|${r.periodEnd}|${r.label}`;
  const periods = new Map<string, ProfitDistributionDto[]>();
  for (const row of rows) {
    const key = periodKey(row);
    periods.set(key, [...(periods.get(key) ?? []), row]);
  }
  // While a search is active, only periods with a matching payout are shown.
  const matching = new Set(controls.rows.map(periodKey));
  const shown = [...periods.entries()].filter(([key]) => matching.has(key));

  return (
    <div>
      <TableToolbar
        controls={controls}
        csv={{ filename: 'profit-distributions' }}
        summary={`${periods.size} declared period${periods.size === 1 ? '' : 's'}`}
      >
        {isOwner && <NewToggle open={showForm} onToggle={() => setShowForm((v) => !v)} what="declaration" />}
      </TableToolbar>

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
          className="mb-4 grid gap-3 rounded-xl border border-aqua/40 bg-white p-5 sm:grid-cols-4"
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
        <Empty>
          {isOwner
            ? 'No periods declared yet. Declare one to split a period’s profit across the cap table.'
            : 'Only payouts to your own holding show here; the owner declares periods.'}
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>No payouts match “{controls.query.trim()}”.</Empty>
      ) : (
        <div className="space-y-4">
          {shown.map(([key, items]) => {
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
                <PeriodTable items={items} columns={columns} query={controls.query} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One declared period's payouts: its own sort, filtered by the tab's one search. */
function PeriodTable({ items, columns, query }: {
  items: ProfitDistributionDto[];
  columns: Column<ProfitDistributionDto>[];
  query: string;
}) {
  const controls = useTableControls(items, columns, { query });
  return <DataTable controls={controls} rowKey={(r) => r.id} className="" />;
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

  const columns: Column<UnreconciledItem>[] = [
    { header: 'Date', cell: (r) => r.date, sort: (r) => r.date, search: (r) => r.date, csv: (r) => r.date },
    { header: 'Type', cell: (r) => label(r.kind), sort: (r) => label(r.kind), search: (r) => label(r.kind), csv: (r) => label(r.kind) },
    {
      header: 'Description',
      cell: (r) => r.description,
      sort: (r) => r.description,
      search: (r) => r.description,
      csv: (r) => r.description,
    },
    {
      header: 'Amount',
      csvHeader: 'Amount (KSh)',
      right: true,
      className: 'font-medium',
      cell: (r) => fmt(r.amountCents),
      sort: (r) => r.amountCents,
      csv: (r) => csvMoney(r.amountCents),
    },
    {
      // "Attached", or Add reference while missing. Search, sort and export read hasReceipt, never the button.
      header: 'Source doc',
      csvHeader: 'Has receipt',
      cell: (r) =>
        r.hasReceipt ? (
          <span className="text-xs text-success">Attached</span>
        ) : (
          <button
            className="text-xs text-aqua-deep hover:underline"
            onClick={async () => {
              const ref = prompt('Receipt / M-Pesa reference:');
              if (!ref?.trim()) return;
              try { await api.reconcile(r.kind, r.id, { receiptRef: ref.trim() }); await load(); }
              catch (err) { onError(err, 'Could not attach reference'); }
            }}
          >Add reference</button>
        ),
      sort: (r) => (r.hasReceipt ? 1 : 0),
      search: (r) => (r.hasReceipt ? 'Attached' : null),
      csv: (r) => (r.hasReceipt ? 'yes' : 'no'),
    },
    {
      header: '',
      right: true,
      cell: (r) => (
        <button
          className={btnGhost}
          onClick={async () => {
            try { await api.reconcile(r.kind, r.id, { reconciled: true }); await load(); }
            catch (err) { onError(err, 'Could not reconcile'); }
          }}
        >Mark reconciled</button>
      ),
    },
  ];
  const controls = useTableControls(items, columns);

  return (
    <div>
      <TableToolbar
        controls={controls}
        csv={{ filename: `unreconciled-${from}-to-${to}` }}
        summary={`${items.length} unreconciled · ${missingReceipt} with no source document`}
      />

      {loading ? <Empty>Loading…</Empty> : items.length === 0 ? (
        <Empty>Everything in this range is reconciled. </Empty>
      ) : (
        <DataTable controls={controls} rowKey={(r) => `${r.kind}-${r.id}`} />
      )}
    </div>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────

/** Opens and closes a tab's "+ New …" form. */
function NewToggle({ open, onToggle, what }: { open: boolean; onToggle: () => void; what: string }) {
  return (
    <button className={btn} onClick={onToggle}>
      {open ? 'Cancel' : `+ New ${what}`}
    </button>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface py-10 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}
