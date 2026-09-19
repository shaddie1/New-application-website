import { describe, expect, it } from 'vitest';

import { maskEmail } from './email.js';

describe('maskEmail', () => {
  it('masks the middle of a long local part', () => {
    expect(maskEmail('olive.ceo@onyxhawk.co.ke')).toBe('o*******o@onyxhawk.co.ke');
  });

  it('keeps the domain fully visible', () => {
    expect(maskEmail('jane@onyxhawk.co.ke')).toContain('@onyxhawk.co.ke');
  });

  it('handles a very short local part without negative-length stars', () => {
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('caps the mask at 7 stars for long local parts', () => {
    const masked = maskEmail('a.very.long.local.part@example.com');
    expect(masked).toMatch(/^a\*{7}t@example\.com$/);
  });

  it('falls back to *** for something with no @', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
