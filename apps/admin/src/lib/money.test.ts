import { describe, expect, it } from 'vitest';
import { money } from './money';

describe('money', () => {
  it('shows a whole amount with no cents', () => {
    expect(money(5_400_000)).toBe('KSh 54,000');
  });

  it('shows an amount with cents to two decimals', () => {
    expect(money(1_552_050)).toBe('KSh 15,520.50');
  });

  it('puts a true minus sign before KSh for a negative amount', () => {
    expect(money(-120_000)).toBe('\u2212KSh 1,200');
  });

  it('shows zero as KSh 0', () => {
    expect(money(0)).toBe('KSh 0');
  });

  it('never shows a negative zero', () => {
    expect(money(-0.4)).toBe('KSh 0');
    expect(money(-40, { whole: true })).toBe('KSh 0');
  });
});

describe('money, whole shillings', () => {
  it('rounds to the nearest shilling', () => {
    expect(money(1_552_050, { whole: true })).toBe('KSh 15,521');
    expect(money(1_552_049, { whole: true })).toBe('KSh 15,520');
  });

  it('keeps the minus sign before KSh', () => {
    expect(money(-120_050, { whole: true })).toBe('\u2212KSh 1,201');
  });
});

describe('money, compact', () => {
  it('shows millions to one decimal', () => {
    expect(money(123_400_000, { compact: true })).toBe('KSh 1.2M');
  });

  it('shows thousands as a whole number of thousands', () => {
    expect(money(34_000_000, { compact: true })).toBe('KSh 340k');
  });

  it('shows an amount under a thousand in whole shillings', () => {
    expect(money(54_050, { compact: true })).toBe('KSh 541');
  });

  it('keeps the minus sign before KSh', () => {
    expect(money(-123_400_000, { compact: true })).toBe('\u2212KSh 1.2M');
  });
});
