'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { downloadCsv } from '../lib/csv';

/**
 * Sort, search and CSV for the finance tables and card lists.
 *
 * A page passes its rows and columns to `useTableControls`, then hands the result
 * to `TableToolbar` (search, Export CSV, and a sort choice for card lists) and,
 * for a table, to `DataTable`. Card lists draw their own cards from
 * `controls.rows`.
 *
 * Search and sort read the values each column declares, never the rendered cell,
 * so a "Mark paid" button can't make a row match "paid" and an amount sorts by
 * cents rather than by its "KSh 1,200" text. A column that declares no sort,
 * search or CSV value is an action column and takes part in none of them.
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  /** The sorted column's header, which is why sortable headers are unique per table. */
  header: string;
  dir: SortDir;
}

export interface Column<T> {
  /** Heading on screen and in the sort choice; also the CSV heading unless `csvHeader` is set. */
  header: string;
  /** The cell. A column without one is never drawn: card-list fields and CSV-only fields. */
  cell?: (row: T) => ReactNode;
  /** Right-aligns the column and keeps its cells on one line, for amounts and counts. */
  right?: boolean;
  /** Extra classes for every cell in the column. */
  className?: string;
  /** Sort key: cents or a count as a number, an ISO date or text as a string. Empty values sort last. */
  sort?: (row: T) => number | string | null | undefined;
  /** Text the search box matches, ignoring case. */
  search?: (row: T) => string | null | undefined;
  /** The CSV cell. Columns export in array order. */
  csv?: (row: T) => unknown;
  csvHeader?: string;
}

export interface TableControls<T> {
  columns: Column<T>[];
  /** Every row, as the page loaded them. */
  all: T[];
  /** The rows to show and export: those matching the search, in the chosen order. */
  rows: T[];
  query: string;
  setQuery: (query: string) => void;
  sort: SortState | null;
  setSort: (sort: SortState | null) => void;
  /** A header click: sort by that column ascending, or flip it if it is already the sort. */
  toggleSort: (header: string) => void;
}

/**
 * Search and sort state for one table or card list. Until a header is clicked
 * the rows keep the order they came in. Pass `query` to follow a search box
 * that another list owns, so one search can drive several tables.
 */
export function useTableControls<T>(
  all: T[],
  columns: Column<T>[],
  options: { query?: string } = {},
): TableControls<T> {
  const [ownQuery, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const query = options.query ?? ownQuery;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const searchers = columns.flatMap((c) => (c.search ? [c.search] : []));
    const matched = needle
      ? all.filter((row) => searchers.some((value) => value(row)?.toLowerCase().includes(needle)))
      : all;

    const key = sort && columns.find((c) => c.header === sort.header)?.sort;
    if (!sort || !key) return matched;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...matched].sort((a, b) => compare(key(a), key(b), sign));
  }, [all, columns, query, sort]);

  const toggleSort = (header: string) =>
    setSort((s) => ({ header, dir: s?.header === header && s.dir === 'asc' ? 'desc' : 'asc' }));

  return { columns, all, rows, query, setQuery, sort, setSort, toggleSort };
}

function compare(a: number | string | null | undefined, b: number | string | null | undefined, sign: number) {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  // Blanks go last whichever way the column sorts.
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const diff = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
  return diff * sign;
}

type CsvColumn<L> = { header: string; value: (line: L) => unknown };

/**
 * What Export CSV writes. By default each visible row is one line of its
 * columns' `csv` values. `lines` is for a list whose export has several lines
 * per row, such as a job and its expense lines; `lines.columns` then describe
 * one line.
 */
export interface CsvExport<T, L = T> {
  filename: string;
  lines?: { of: (row: T) => L[]; columns: CsvColumn<L>[] };
}

const btnGhost = 'rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg-muted';

/**
 * Search box, Export CSV and, for card lists, a sort choice. `summary` sits on
 * the left as the finance toolbars have it; `children` are page actions placed
 * after Export CSV, such as "+ New asset".
 */
export function TableToolbar<T, L = T>({
  controls, csv, sortChoice, summary, children,
}: {
  controls: TableControls<T>;
  csv?: CsvExport<T, L>;
  /** Card lists have no headers to click, so they choose the sort here. */
  sortChoice?: boolean;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  const { columns, all, rows, query, setQuery, sort, setSort } = controls;
  const searchable = columns.some((c) => c.search);
  const sortable = columns.filter((c) => c.sort);

  const lineCount = (list: T[]) => (csv?.lines ? list.flatMap(csv.lines.of).length : list.length);

  const exportCsv = () => {
    if (!csv) return;
    if (csv.lines) {
      downloadCsv(csv.filename, csv.lines.columns, rows.flatMap(csv.lines.of));
    } else {
      const csvColumns = columns.flatMap((c) => (c.csv ? [{ header: c.csvHeader ?? c.header, value: c.csv }] : []));
      downloadCsv(csv.filename, csvColumns, rows);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchable && (
        <input
          type="search"
          aria-label="Search"
          placeholder="Search…"
          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm sm:w-56"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {sortChoice && sortable.length > 0 && (
        <select
          aria-label="Sort by"
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
          value={sort ? `${sort.dir}:${sort.header}` : ''}
          onChange={(e) => {
            const value = e.target.value;
            const cut = value.indexOf(':');
            setSort(value ? { dir: value.slice(0, cut) as SortDir, header: value.slice(cut + 1) } : null);
          }}
        >
          <option value="">As listed</option>
          {sortable.map((c) => [
            <option key={`asc:${c.header}`} value={`asc:${c.header}`}>{c.header} ↑</option>,
            <option key={`desc:${c.header}`} value={`desc:${c.header}`}>{c.header} ↓</option>,
          ])}
        </select>
      )}
      {summary && <span className="text-sm text-text-muted">{summary}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span aria-live="polite" className="text-xs text-text-muted">
          {csv && query.trim() ? `Exporting ${lineCount(rows)} of ${lineCount(all)} rows` : ''}
        </span>
        {csv && <button type="button" className={btnGhost} onClick={exportCsv}>Export CSV</button>}
        {children}
      </div>
    </div>
  );
}

/**
 * The table. Cells come from the columns' `cell` renderers; `footer` holds the
 * caller's own <tfoot> rows, drawn as given, so totals cover every row whatever
 * the search. The box scrolls sideways when the table is wider than the screen.
 */
export function DataTable<T>({
  controls, rowKey, footer, dense, className,
}: {
  controls: TableControls<T>;
  rowKey: (row: T) => string;
  footer?: ReactNode;
  /** Tighter cells for a table inside a card, such as a job's expenses. */
  dense?: boolean;
  /** Replaces the bordered box, for a table that already sits inside a card. */
  className?: string;
}) {
  const { rows, sort, toggleSort } = controls;
  const columns = controls.columns.filter((c) => c.cell);
  const pad = dense ? 'px-3 py-1.5' : 'px-5 py-3';

  return (
    <div className={`overflow-x-auto ${className ?? 'rounded-xl border border-border bg-surface'}`}>
      <table className={`w-full ${dense ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr className="border-b border-border bg-bg-muted/30 text-xs uppercase tracking-widest text-text-muted">
            {columns.map((c, i) => {
              const dir = sort?.header === c.header ? sort.dir : null;
              return (
                <th
                  key={i}
                  scope="col"
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  className={`${pad} font-normal ${c.right ? 'text-right' : 'text-left'}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.header)}
                      className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-text"
                    >
                      {c.header}
                      <span aria-hidden className={dir ? '' : 'opacity-40'}>
                        {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
                      </span>
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-bg-muted/30">
              {columns.map((c, i) => (
                <td key={i} className={`${pad} ${c.right ? 'whitespace-nowrap text-right' : ''} ${c.className ?? ''}`}>
                  {c.cell?.(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t-2 border-border bg-bg-muted/30">{footer}</tfoot>}
      </table>
    </div>
  );
}
