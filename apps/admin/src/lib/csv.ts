/** Client-side CSV export for finance tables. */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Quote when the value contains a delimiter, quote or newline; double inner quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Download `rows` as a CSV file. `columns` fixes the order and the headings, so
 * the export matches what is on screen rather than raw DTO field names.
 */
export function downloadCsv<T>(
  filename: string,
  columns: { header: string; value: (row: T) => unknown }[],
  rows: T[],
): void {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(',')),
  ];

  // The BOM makes Excel open UTF-8 correctly, which matters for "KSh" and names.
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Money for exports: plain decimal, no thousands separators or currency mark. */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}
