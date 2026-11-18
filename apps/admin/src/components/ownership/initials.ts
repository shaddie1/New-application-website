/** Shown where a name gives no letters to take. */
export const NO_INITIALS = '?';

/**
 * A holder's initials, for their badge and their segment of the share bar:
 * the first letter of the first word and of the last, in capitals. Text in
 * brackets is not part of the name, so "OnyxHawk (Company)" is "O".
 */
export function initials(name: string): string {
  const words = name
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    // A word starts at its first letter or digit: '"Zack"' counts as "Zack".
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter((word) => word !== '');

  const first = words[0];
  if (first === undefined) return NO_INITIALS;
  const last = words.length > 1 ? words[words.length - 1]! : '';
  // By code point, so a letter outside the basic plane is not cut in half.
  const letter = (word: string) => Array.from(word)[0] ?? '';
  return (letter(first) + letter(last)).toLocaleUpperCase('en');
}
