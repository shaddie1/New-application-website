import { describe, expect, it } from 'vitest';

import { COLOURED_HOLDERS, RETAINED_SEGMENT, colourIndexOf, splitSegments } from './split';

const holder = (id: string, name: string, basisPoints: number) => ({ id, name, basisPoints });

const company = holder('h1', 'OnyxHawk (Company)', 4000);
const shadrack = holder('h2', 'Shadrack Amihanda', 3000);
const zecharia = holder('h3', 'Zecharia Mwangi', 3000);

describe('colourIndexOf', () => {
  it('gives the first five holders their own colour and the rest none', () => {
    expect(COLOURED_HOLDERS).toBe(5);
    expect([0, 1, 2, 3, 4, 5, 6].map(colourIndexOf)).toEqual([0, 1, 2, 3, 4, null, null]);
  });
});

describe('splitSegments', () => {
  it('gives each holder a segment as wide as their stake, in table order', () => {
    expect(splitSegments([company, shadrack, zecharia])).toEqual([
      { key: 'h1', kind: 'holder', name: 'OnyxHawk (Company)', initials: 'O', basisPoints: 4000, widthPercent: 40, colourIndex: 0 },
      { key: 'h2', kind: 'holder', name: 'Shadrack Amihanda', initials: 'SA', basisPoints: 3000, widthPercent: 30, colourIndex: 1 },
      { key: 'h3', kind: 'holder', name: 'Zecharia Mwangi', initials: 'ZM', basisPoints: 3000, widthPercent: 30, colourIndex: 2 },
    ]);
  });

  it('adds a "Retained" segment for what the stakes do not cover', () => {
    const segments = splitSegments([company, shadrack]);
    expect(segments).toHaveLength(3);
    expect(segments[2]).toEqual({
      key: RETAINED_SEGMENT, kind: 'retained', name: 'Retained', initials: '', basisPoints: 3000, widthPercent: 30, colourIndex: null,
    });
  });

  it('has no "Retained" segment at exactly 100%', () => {
    expect(splitSegments([company, shadrack, zecharia]).some((s) => s.kind === 'retained')).toBe(false);
  });

  it('never fills more than the bar when the stakes total over 100%', () => {
    const segments = splitSegments([holder('a', 'A', 6000), holder('b', 'B', 6000)]);
    expect(segments.map((s) => s.widthPercent)).toEqual([50, 50]);
    expect(segments.some((s) => s.kind === 'retained')).toBe(false);
  });

  it('gives holders past the fifth no colour of their own', () => {
    const seven = [3000, 2000, 1500, 1200, 1000, 800, 500].map((bp, i) => holder(`h${i}`, `Holder ${i}`, bp));
    expect(splitSegments(seven).map((s) => s.colourIndex)).toEqual([0, 1, 2, 3, 4, null, null]);
  });

  it('keeps a holder’s colour by position when one before them has no stake to draw', () => {
    const segments = splitSegments([company, holder('h0', 'No Stake', 0), zecharia]);
    expect(segments.map((s) => [s.key, s.colourIndex])).toEqual([['h1', 0], ['h3', 2], [RETAINED_SEGMENT, null]]);
  });

  it('draws nothing for an empty cap table', () => {
    expect(splitSegments([])).toEqual([]);
  });
});
