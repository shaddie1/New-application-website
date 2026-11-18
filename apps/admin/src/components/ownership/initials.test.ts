import { describe, expect, it } from 'vitest';

import { NO_INITIALS, initials } from './initials';

describe('initials', () => {
  it('takes the first letter of the first and last names', () => {
    expect(initials('Zecharia Mwangi')).toBe('ZM');
  });

  it('ignores text in brackets', () => {
    expect(initials('OnyxHawk (Company)')).toBe('O');
  });

  it('gives one letter for a single word', () => {
    expect(initials('Director')).toBe('D');
  });

  it('gives a placeholder for an empty name', () => {
    expect(NO_INITIALS).toBe('?');
    expect(initials('')).toBe(NO_INITIALS);
    expect(initials('   ')).toBe(NO_INITIALS);
  });

  it('gives a placeholder when nothing is left outside the brackets', () => {
    expect(initials('(Company)')).toBe(NO_INITIALS);
  });

  it('skips middle names', () => {
    expect(initials('Mary Wanjiru Otieno')).toBe('MO');
  });

  it('writes the letters in capitals', () => {
    expect(initials('amina yusuf')).toBe('AY');
  });

  it('is not thrown by extra spaces or punctuation before a name', () => {
    expect(initials('  Zecharia    Mwangi ')).toBe('ZM');
    expect(initials('"Zack" Mwangi')).toBe('ZM');
  });
});
