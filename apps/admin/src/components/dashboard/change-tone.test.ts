import { describe, expect, it } from 'vitest';

import { changeChipClass, changeTone } from './change-tone';

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

describe('changeChipClass', () => {
  it('draws a fall in coral: deep coral text on the coral tint', () => {
    expect(changeChipClass('down').split(' ')).toEqual(['bg-overdue-tint', 'text-overdue']);
  });

  it('draws a rise in teal: deep teal text on the teal tint', () => {
    expect(changeChipClass('up').split(' ')).toEqual(['bg-positive-tint', 'text-positive']);
  });

  it('keeps red and amber off a change, whichever way it went', () => {
    for (const tone of ['up', 'down', 'flat', 'none'] as const) {
      expect(changeChipClass(tone)).not.toMatch(/danger|warning|amber/);
    }
  });

  it('draws no change, and no earlier figure, in the neutral grey', () => {
    expect(changeChipClass('flat')).toBe(changeChipClass('none'));
    expect(changeChipClass('flat')).toMatch(/text-charcoal-muted/);
  });
});
