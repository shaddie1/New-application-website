const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Markup that is safe to insert as-is. Build it with `html`, never from user input. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/**
 * Tagged template for email markup. Every interpolated value is HTML-escaped
 * unless it is already SafeHtml (a nested `html` fragment), so a name like
 * `<b>Jane</b>` arrives as text. Arrays are joined; null and false render nothing.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, i) => {
    out += renderValue(value) + strings[i + 1]!;
  });
  return new SafeHtml(out);
}

function renderValue(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value == null || value === false) return '';
  return escapeHtml(String(value));
}

/** "olive.ceo@onyxhawk.co.ke" → "o*******o@onyxhawk.co.ke" — enough to recognise, not enough to leak. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 7))}${local[local.length - 1]}${domain}`;
}
