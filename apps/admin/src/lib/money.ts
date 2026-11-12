/**
 * The admin's one way of writing a KSh amount. Amounts arrive in cents.
 *
 *   money(5_400_000)                      "KSh 54,000"      a whole amount shows no cents
 *   money(1_552_050)                      "KSh 15,520.50"   cents show to two decimals
 *   money(-120_000)                       "−KSh 1,200"      a true minus sign, before "KSh"
 *   money(1_552_050, { whole: true })     "KSh 15,521"      nearest shilling
 *   money(123_400_000, { compact: true }) "KSh 1.2M"        for axis labels and tight spaces
 */

export type MoneyOptions = {
  /** Round to the nearest shilling and never show cents. */
  whole?: boolean;
  /** Short form: "KSh 1.2M", "KSh 340k", and whole shillings under a thousand. */
  compact?: boolean;
};

/** U+2212, the true minus sign: as wide as a digit, unlike a hyphen. */
const MINUS = '\u2212';
const LOCALE = 'en-KE';

/** The size of the amount in shillings, without its sign or "KSh". */
function magnitude(absCents: number, { whole, compact }: MoneyOptions): string {
  const shillings = absCents / 100;
  if (compact) {
    if (shillings >= 1_000_000) return `${(shillings / 1_000_000).toFixed(1)}M`;
    if (shillings >= 1_000) return `${Math.round(shillings / 1_000)}k`;
    return String(Math.round(shillings));
  }
  if (whole) return Math.round(shillings).toLocaleString(LOCALE);
  const cents = Math.round(absCents);
  const digits = cents % 100 === 0 ? 0 : 2;
  return (cents / 100).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function money(cents: number, options: MoneyOptions = {}): string {
  const size = magnitude(Math.abs(cents), options);
  // An amount that rounds to nothing is "KSh 0", never "−KSh 0".
  const negative = cents < 0 && /[1-9]/.test(size);
  return `${negative ? MINUS : ''}KSh ${size}`;
}
