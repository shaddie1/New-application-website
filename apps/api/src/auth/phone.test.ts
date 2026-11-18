import { describe, expect, it } from 'vitest';

import { e164 } from './phone.js';

describe('e164', () => {
  it('reads a Kenyan number however it was typed', () => {
    expect(e164('0712 345 678')).toBe('+254712345678');
    expect(e164('712345678')).toBe('+254712345678');
    expect(e164('+254712345678')).toBe('+254712345678');
    expect(e164('+254 0712 345 678')).toBe('+254712345678');
  });

  it('gives null for something that is not a phone number', () => {
    expect(e164('12')).toBeNull();
    expect(e164('+254 712 345')).toBeNull();
  });

  it('passes a number from another country through', () => {
    expect(e164('+44 20 7946 0958')).toBe('+442079460958');
  });
});
