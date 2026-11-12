'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShareholderDto } from '@onyxhawk/types';
import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { CATEGORICAL, OTHER_GREY } from '../../../src/components/charts';
import { EditDetails } from '../../../src/components/ownership/EditDetails';
import { EditStakes } from '../../../src/components/ownership/EditStakes';
import {
  DEFAULT_SCOPE, nairobiMonth, scopeFigures, type OwnershipScope, type ReceivedEquityOverview,
} from '../../../src/components/ownership/scope';
import { BASIS_POINTS_TOTAL, formatPercentShort as pct } from '../../../src/components/ownership/stakes';
import { Button } from '../../../src/components/ui/button';
import { Segmented, type SegmentedOption } from '../../../src/components/ui/segmented';
import { money as fmt } from '../../../src/lib/money';

// Cap-table bar colours, in table order, from the chart palette. Holders past
// the fifth share the neutral grey; every slice is still named in the legend
// and the table.
const COLOURED_HOLDERS = 5;
function sliceColor(index: number) {
  return index < COLOURED_HOLDERS ? CATEGORICAL[index]! : OTHER_GREY;
}

const SCOPES: SegmentedOption<OwnershipScope>[] = [
  { value: 'all-time', label: 'All time' },
  { value: 'this-month', label: 'This month' },
];

export default function EquityPage() {
  const session = useRequireAdmin();
  // "This month" is the current month in Nairobi. The one overview requested
  // for it carries the all-time figures too, so the control needs no request.
  const month = useMemo(() => nairobiMonth(new Date()), []);
  const [scope, setScope] = useState<OwnershipScope>(DEFAULT_SCOPE);

  const [overview, setOverview] = useState<ReceivedEquityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stakesOpen, setStakesOpen] = useState(false);
  const [detailsFor, setDetailsFor] = useState<ShareholderDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.equity(month.from, month.to);
      setOverview(res.overview);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load ownership (${err.status}).` : 'Could not load ownership.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  if (session === undefined) return <div className="text-text-muted">Loading…</div>;
  if (!session) return null;
  if (!session.user.isOwner) {
    return <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">Owner access required.</div>;
  }

  // Every figure below comes from here, so the control moves them together.
  const figures = overview ? scopeFigures(overview, scope) : null;
  const shown = loading ? null : figures;
  const holders = figures?.holders ?? [];
  const totalBasisPoints = overview?.totalBasisPoints ?? 0;
  const capTableBalanced = totalBasisPoints === BASIS_POINTS_TOTAL;
  const allTimeScope = scope === 'all-time';
  const canEdit = !loading && overview !== null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-serif text-3xl">Ownership</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented legend="Figures shown" name="ownership-scope" options={SCOPES} value={scope} onChange={setScope} />
          <Button onClick={() => setStakesOpen(true)} disabled={!canEdit}>Edit stakes</Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* ── Totals for the chosen scope ──────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs text-text-muted uppercase tracking-widest">
            {allTimeScope ? 'Since day one' : `This month · ${month.label}`}
          </h2>
          {allTimeScope && overview?.allTime.firstJobDate && (
            <span className="text-xs text-text-muted">
              First project {overview.allTime.firstJobDate} · latest {overview.allTime.lastJobDate}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total projects" value={shown?.projects == null ? '—' : String(shown.projects)} />
          <StatCard label="Income generated" value={shown?.incomeCents == null ? '—' : fmt(shown.incomeCents)} color="text-success" />
          <StatCard label="Total expenses" value={shown?.expensesCents == null ? '—' : fmt(shown.expensesCents)} />
          <StatCard
            label="Net profit"
            value={shown ? fmt(shown.netCents) : '—'}
            color={!shown || shown.netCents >= 0 ? 'text-success' : 'text-danger'}
            accent
          />
        </div>
      </section>

      {/* ── Cap table split bar ──────────────────────────────────────────────── */}
      {!loading && holders.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-text-muted uppercase tracking-widest mb-4">Share split</p>
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-bg-muted">
            {holders.map(({ shareholder: s }, i) => (
              <div
                key={s.id}
                title={`${s.name} — ${pct(s.basisPoints)}`}
                style={{
                  width: `${(s.basisPoints / BASIS_POINTS_TOTAL) * 100}%`,
                  backgroundColor: sliceColor(i),
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {holders.map(({ shareholder: s, shareCents }, i) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: sliceColor(i) }} />
                <span>{s.name}</span>
                <span className="figure text-text-muted">{pct(s.basisPoints)}</span>
                <span className="figure text-text-muted">{fmt(shareCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cap table doesn't add up — say so plainly rather than quietly mis-splitting. */}
      {!loading && overview && figures && !capTableBalanced && (
        <div className="mb-6 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm">
          <p className="text-warning font-medium">
            The stakes add up to {pct(totalBasisPoints)}, not 100%.
          </p>
          <p className="text-text-muted mt-1">
            {totalBasisPoints < BASIS_POINTS_TOTAL
              ? `The remaining ${pct(BASIS_POINTS_TOTAL - totalBasisPoints)} (${fmt(figures.unallocatedCents)} ${allTimeScope ? 'all-time' : 'this month'}) is shown as retained by the business.`
              : 'Shares are being over-allocated — the payouts below total more than the profit. Adjust the percentages so they sum to 100%.'}
          </p>
        </div>
      )}

      {/* ── Shareholder table ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <span className="figure text-sm text-text-muted">
          {figures && `${holders.length} shareholder${holders.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-text-muted text-sm">Loading…</div>
      ) : !figures ? (
        // The load failed and the message above says so: an empty cap table is not known.
        null
      ) : holders.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-text-muted text-sm">
          <p>No shareholders yet. Add the holders and their stakes, which must total 100%.</p>
          <Button className="mt-4" onClick={() => setStakesOpen(true)}>Edit stakes</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-widest border-b border-border bg-bg-muted/30">
                <th className="px-5 py-3 text-left font-normal">Shareholder</th>
                <th className="px-5 py-3 text-right font-normal">Stake</th>
                <th className="px-5 py-3 text-right font-normal">
                  {allTimeScope ? 'Share all-time' : `Share of ${month.label}`}
                </th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holders.map(({ shareholder: s, shareCents }, i) => (
                <tr key={s.id} className="hover:bg-bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: sliceColor(i) }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.name}</span>
                          {s.kind === 'COMPANY' && (
                            <span className="rounded-full bg-bg-muted text-text-muted text-xs px-2 py-0.5">Company</span>
                          )}
                        </div>
                        {(s.title || s.userName) && (
                          <p className="text-text-muted text-xs mt-0.5">
                            {[s.title, s.userName].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="figure px-5 py-3 text-right font-medium">{pct(s.basisPoints)}</td>
                  <td className={`figure px-5 py-3 text-right font-medium ${shareCents >= 0 ? 'text-success' : 'text-danger'}`}>
                    {fmt(shareCents)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => setDetailsFor(s)}>
                      Edit details<span className="sr-only"> of {s.name}</span>
                    </Button>
                  </td>
                </tr>
              ))}

              {/* Only meaningful when the stakes don't cover 100%. */}
              {figures.unallocatedCents !== 0 && (
                <tr className="bg-bg-muted/20">
                  <td className="px-5 py-3 text-text-muted italic">Retained by the business</td>
                  <td className="figure px-5 py-3 text-right text-text-muted">
                    {pct(BASIS_POINTS_TOTAL - totalBasisPoints)}
                  </td>
                  <td className="figure px-5 py-3 text-right text-text-muted">{fmt(figures.unallocatedCents)}</td>
                  <td />
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-border bg-bg-muted/30">
              <tr>
                <td className="px-5 py-3 font-medium">Net profit to split</td>
                <td className={`figure px-5 py-3 text-right font-medium ${capTableBalanced ? '' : 'text-warning'}`}>
                  {pct(totalBasisPoints)}
                </td>
                <td className={`figure px-5 py-3 text-right font-medium ${figures.footerNetCents >= 0 ? 'text-success' : 'text-danger'}`}>
                  {fmt(figures.footerNetCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted">
        Shares are calculated on net profit — income after expenses — for approved jobs only.
      </p>

      <EditStakes
        open={stakesOpen}
        onOpenChange={setStakesOpen}
        holders={holders.map((h) => h.shareholder)}
        onStakesChanged={() => void load()}
      />
      <EditDetails
        holder={detailsFor}
        onOpenChange={(open) => { if (!open) setDetailsFor(null); }}
        onSaved={() => void load()}
      />
    </div>
  );
}

function StatCard({
  label, value, color, accent,
}: {
  label: string; value: string; color?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-aqua/40 bg-white' : 'border-border bg-surface'}`}>
      <p className="text-text-muted text-xs uppercase tracking-widest">{label}</p>
      <p className={`figure mt-2 text-2xl ${color ?? ''}`}>{value}</p>
    </div>
  );
}
