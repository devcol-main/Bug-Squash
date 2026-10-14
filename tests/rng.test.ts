import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

const take = (seed: number, n: number): number[] => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r());
};

describe('createRng', () => {
  it('same seed produces the same sequence', () => {
    expect(take(123, 20)).toEqual(take(123, 20));
  });

  it('different seeds produce different sequences', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('values stay within [0, 1)', () => {
    for (const v of take(42, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('consecutive values are not all identical', () => {
    expect(new Set(take(7, 50)).size).toBeGreaterThan(1);
  });
});
