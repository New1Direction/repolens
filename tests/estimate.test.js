import { describe, it, expect } from 'vitest';
import { estimateTokens, formatTokens } from '../src/estimate.js';

describe('estimateTokens', () => {
  it('is zero for empty / whitespace / nullish', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   \n\t ')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
  it('estimates a realistic count for prose (~4 chars/token)', () => {
    const t = estimateTokens('word '.repeat(100)); // 500 chars, 100 words
    expect(t).toBeGreaterThan(80);
    expect(t).toBeLessThan(200);
  });
  it('grows monotonically with length', () => {
    expect(estimateTokens('the quick brown fox jumps')).toBeLessThan(
      estimateTokens('the quick brown fox jumps over the lazy dog again and again')
    );
  });
  it('always returns an integer ≥ 1 for non-empty input', () => {
    const t = estimateTokens('x');
    expect(Number.isInteger(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(1);
  });
});

describe('formatTokens', () => {
  it('formats compactly', () => {
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(2847)).toBe('2.8k');
    expect(formatTokens(15000)).toBe('15k');
    expect(formatTokens(1_200_000)).toBe('1.2M');
  });
  it('handles zero and junk', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(undefined)).toBe('0');
  });
});
