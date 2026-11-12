import { describe, expect, it } from 'vitest';

import { greeting } from './greeting';

// Nairobi is three hours ahead of UTC all year.
const at = (nairobiTime: string) => new Date(`2026-11-12T${nairobiTime}:00+03:00`);

describe('greeting', () => {
  it('says good morning before noon in Nairobi', () => {
    expect(greeting(at('05:00'), 'Test Owner')).toBe('Good morning, Test');
    expect(greeting(at('11:59'), 'Test Owner')).toBe('Good morning, Test');
  });

  it('says good afternoon from noon', () => {
    expect(greeting(at('12:00'), 'Test Owner')).toBe('Good afternoon, Test');
    expect(greeting(at('16:59'), 'Test Owner')).toBe('Good afternoon, Test');
  });

  it('says good evening from five o’clock and through the night', () => {
    expect(greeting(at('17:00'), 'Test Owner')).toBe('Good evening, Test');
    expect(greeting(at('23:30'), 'Test Owner')).toBe('Good evening, Test');
    expect(greeting(at('04:59'), 'Test Owner')).toBe('Good evening, Test');
  });

  it('goes by the Nairobi clock, not the UTC one', () => {
    // 10:00 UTC is 13:00 in Nairobi.
    expect(greeting(new Date('2026-11-12T10:00:00Z'), 'Test Owner')).toBe('Good afternoon, Test');
    // 21:30 UTC is 00:30 the next day in Nairobi.
    expect(greeting(new Date('2026-11-12T21:30:00Z'), 'Test Owner')).toBe('Good evening, Test');
  });

  it('uses the first name only', () => {
    expect(greeting(at('09:00'), '  Amina Wanjiru Yusuf ')).toBe('Good morning, Amina');
  });

  it('greets without a name when there is none', () => {
    expect(greeting(at('09:00'), '')).toBe('Good morning');
    expect(greeting(at('09:00'), undefined)).toBe('Good morning');
  });
});
