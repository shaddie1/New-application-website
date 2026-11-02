/** Kenyan numbers as typed → E.164; anything else passed through if it already is. */
export function e164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  // The nine digits after Kenya's 254, dropping a trunk 0 typed after the country code.
  const kenyan =
    digits.startsWith('254') ? digits.slice(3).replace(/^0/, '')
    : digits.startsWith('0') ? digits.slice(1)
    : digits.length === 9 ? digits
    : null;
  if (kenyan !== null) return /^\d{9}$/.test(kenyan) ? `+254${kenyan}` : null;
  const candidate = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}
