/** Kenyan numbers as typed → E.164; anything else passed through if it already is. */
export function e164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const candidate =
    digits.startsWith('254') ? `+${digits}`
    : digits.startsWith('0') ? `+254${digits.slice(1)}`
    : digits.length === 9 ? `+254${digits}`
    : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}
