import { describe, expect, it } from 'vitest';

import { changeTone } from './change-tone';

describe('changeTone', () => {
  it('is "up" for a rise', () => {
    expect(changeTone(4)).toBe('up');
    expect(changeTone(250)).toBe('up');
  });

  it('is "down" for a decline, however small or large', () => {
    expect(changeTone(-1)).toBe('down');
    expect(changeTone(-100)).toBe('down');
  });

  it('is "flat" for no change', () => {
    expect(changeTone(0)).toBe('flat');
    expect(changeTone(-0)).toBe('flat');
  });

  it('is "none" when there is no earlier figure to compare with', () => {
    expect(changeTone(null)).toBe('none');
    expect(changeTone(undefined)).toBe('none');
  });

  it('is "none" for a figure that is not a number', () => {
    expect(changeTone(Number.NaN)).toBe('none');
    expect(changeTone(Number.POSITIVE_INFINITY)).toBe('none');
  });
});
