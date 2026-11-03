'use client';

import type { MyShares, ServiceLineFigures } from '@onyxhawk/types';

import { ColumnChart, StatTile, money, signedMoney, type ColumnPoint } from './charts';
import {
  calendarDate,
  monthName,
  nairobiDate,
  periodChanges,
  shownMonths,
  stakePercent,
  type PeriodView,
} from './MySharesPeriod';

/**
 * The regions of the shareholder page below its header: the holder's shares,
 * the company's growth and the period's revenue by service line. Each takes
 * the payload and the selected period; none of them fetches.
 */

/** Tile rows fill the width whatever their count, and drop to one column on a phone. */
const TILE_ROW = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]';

export function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-serif text-2xl text-charcoal">
        {title}
      </h2>
      {children && <p className="mt-1 max-w-prose text-sm text-charcoal-muted">{children}</p>}
    </div>
  );
}

/** "Share of profit" or, for a negative figure, "Share of the loss". */
function shareLabel(cents: number): string {
  return cents < 0 ? 'Share of the loss' : 'Share of profit';
}

// ── Your shares ──────────────────────────────────────────────────────────────

export function SharesSection({ data, view }: { data: MyShares; view: PeriodView }) {
  const stake = stakePercent(data.holder.basisPoints);
  const all = data.periods.allTime;
  const applied = (net: number) =>
    `Your current stake of ${stake} applied to net ${net < 0 ? 'loss' : 'profit'} of ${signedMoney(net)}.`;

  return (
    <section>
      <SectionHeading title="Your shares">
        Shares of profit are the books&rsquo; net profit at your current stake, not money received. Past periods
        use today&rsquo;s stake.
      </SectionHeading>

      <div className={TILE_ROW}>
        <StatTile label="Stake" value={stake} context="Your current share of the company." />
        {view.kind !== 'allTime' && (
          <StatTile
            label={`${shareLabel(view.figures.ownShareCents)}, ${view.title}`}
            value={signedMoney(view.figures.ownShareCents)}
            context={view.hasRecords ? applied(view.figures.netCents) : 'No records yet for this month.'}
          />
        )}
        <StatTile
          label={`${shareLabel(all.ownShareCents)}, all time`}
          value={signedMoney(all.ownShareCents)}
          context={applied(all.netCents)}
        />
      </div>

      <MoneyInAndOut invested={data.invested} payouts={data.payouts} />
    </section>
  );
}

/** Money put in beside payouts to date: actual money, whatever the period. */
function MoneyInAndOut({ invested, payouts }: { invested: MyShares['invested']; payouts: MyShares['payouts'] }) {
  const figures = [
    { label: 'Invested', value: money(invested.capitalCents), note: 'Capital put in' },
    { label: 'Lent to the company', value: money(invested.lentCents), note: 'Loans, not counted as invested' },
    { label: 'Paid out', value: signedMoney(payouts.paidCents), note: 'Payouts paid to date' },
    { label: 'Pending', value: signedMoney(payouts.pendingCents), note: 'Payouts declared, not yet paid' },
  ];
  return (
    <div className="mt-4 rounded-xl border border-line bg-white p-5">
      <h3 className="text-sm font-medium text-charcoal">Money in and paid out</h3>
      <p className="mt-0.5 text-xs text-charcoal-muted">
        Money actually put in and paid out, to date, whatever the period above.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-charcoal-muted">{f.label}</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums text-charcoal">{f.value}</dd>
            <dd className="text-xs text-charcoal-muted">{f.note}</dd>
          </div>
        ))}
      </dl>

      {payouts.rows.length === 0 ? (
        <p className="mt-4 border-t border-line pt-4 text-sm text-charcoal-muted">No payouts declared yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {payouts.rows.map((row, i) => (
            <li
              key={`${row.periodStart}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-charcoal">{row.label}</p>
                <p className="text-xs text-charcoal-muted">
                  Profit for {calendarDate(row.periodStart)} to {calendarDate(row.periodEnd)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium tabular-nums text-charcoal">{signedMoney(row.amountCents)}</p>
                <p className={`text-xs ${row.status === 'PAID' ? 'text-success' : 'text-charcoal-muted'}`}>
                  {row.status === 'PAID' ? (row.paidAt ? `Paid ${nairobiDate(row.paidAt)}` : 'Paid') : 'Pending'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Company growth ───────────────────────────────────────────────────────────

export function GrowthSection({
  data,
  view,
  onSelectMonth,
}: {
  data: MyShares;
  view: PeriodView;
  onSelectMonth: (key: string) => void;
}) {
  const months = shownMonths(data);
  const changes = periodChanges(data, view);
  const points = (values: (m: (typeof months)[number]) => number[]): ColumnPoint[] =>
    months.map((m) => ({
      key: m.key,
      label: monthName(m.key, 'long'),
      shortLabel: monthName(m.key, 'short', false),
      values: values(m),
      hasRecords: m.hasRecords,
      inProgress: m.inProgress,
    }));
  // Both charts share one selection, which is the page's period when it is a month.
  const selectedKey = view.kind === 'month' ? view.key : null;
  const context = !view.hasRecords
    ? 'No records yet for this month.'
    : view.inProgress
      ? 'In progress: figures to date.'
      : undefined;

  return (
    <section>
      <SectionHeading title="Company growth">
        OnyxHawk as a whole.
        <span className="print:hidden">
          {' '}
          Select a month on either chart to see its exact figures and its breakdown below.
        </span>
      </SectionHeading>

      <div className={TILE_ROW}>
        <StatTile
          label={`Revenue, ${view.title}`}
          value={money(view.figures.revenueCents)}
          comparisons={changes?.revenue}
          context={context}
        />
        <StatTile
          label={`Net profit, ${view.title}`}
          value={signedMoney(view.figures.netCents)}
          comparisons={changes?.net}
          context={context}
        />
        <StatTile
          label={`Jobs completed, ${view.title}`}
          value={view.figures.jobs.toLocaleString('en-KE')}
          comparisons={changes?.jobs}
          context={context}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ColumnChart
          title="Revenue and net profit, last 12 months"
          series={[
            { key: 'revenue', label: 'Revenue' },
            { key: 'net', label: 'Net profit' },
          ]}
          points={points((m) => [m.revenueCents, m.netCents])}
          unit="money"
          selectedKey={selectedKey}
          onSelect={onSelectMonth}
        />
        <ColumnChart
          title="Jobs completed, last 12 months"
          series={[{ key: 'jobs', label: 'Jobs' }]}
          points={points((m) => [m.jobs])}
          unit="count"
          selectedKey={selectedKey}
          onSelect={onSelectMonth}
        />
      </div>
    </section>
  );
}

// ── Revenue by service line ──────────────────────────────────────────────────

/** Lines with a service illustration, copied from the website into public/services. */
const ILLUSTRATED = new Set(['residential', 'office', 'hospital', 'sofa']);

export function ServiceBreakdown({ view }: { view: PeriodView }) {
  const lines = view.byServiceLine;
  const total = lines.reduce((acc, l) => acc + l.revenueCents, 0);
  const max = Math.max(...lines.map((l) => l.revenueCents), 1);

  return (
    <figure className="chart-fill rounded-xl border border-line bg-white p-5">
      <figcaption className="text-sm font-medium text-charcoal">Revenue by service line, {view.phrase}</figcaption>
      {lines.length === 0 ? (
        <p className="mt-4 text-sm text-charcoal-muted">No jobs recorded for {view.phrase}.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {lines.map((line) => (
            <ServiceRow key={line.code ?? '__unclassified'} line={line} total={total} max={max} />
          ))}
        </ul>
      )}
    </figure>
  );
}

function ServiceRow({ line, total, max }: { line: ServiceLineFigures; total: number; max: number }) {
  const share = total > 0 ? Math.round((line.revenueCents / total) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <ServiceImage code={line.code} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-charcoal">{line.name}</span>
          <span className="shrink-0 font-medium tabular-nums text-charcoal">
            {signedMoney(line.revenueCents)}
            <span className="ml-2 text-xs font-normal text-charcoal-muted">{share}%</span>
          </span>
        </div>
        <span className="mt-1.5 block h-2 overflow-hidden rounded-pill bg-mist">
          <span
            className="block h-full rounded-pill"
            style={{
              width: `${Math.max(2, (Math.max(0, line.revenueCents) / max) * 100)}%`,
              backgroundColor: 'var(--chart-accent)',
            }}
          />
        </span>
        <span className="mt-1 block text-xs text-charcoal-muted">
          {line.jobs} {line.jobs === 1 ? 'job' : 'jobs'}
        </span>
      </div>
    </li>
  );
}

/** The line's illustration, or one plain icon for every line without one. Decorative: the row names the line. */
function ServiceImage({ code }: { code: string | null }) {
  if (code && ILLUSTRATED.has(code)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/services/${code}.webp`}
        alt=""
        className="h-12 w-[4.5rem] shrink-0 rounded-lg bg-mist object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-lg bg-aqua-soft text-aqua-deep"
    >
      {/* A spray bottle: cleaning in general, for any line without its own picture. */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 8h5l1 3v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9l1-3Z" />
        <path d="M10 8V5h4l3 2" />
        <path d="M17 4.5 19 4M17 7l2 .5M17 9.5 19 11" />
      </svg>
    </span>
  );
}
