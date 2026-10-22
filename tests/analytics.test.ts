import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageOf, track } from '../src/analytics';

const g = globalThis as { devcol?: unknown };

afterEach(() => {
  delete g.devcol;
});

describe('analytics track', () => {
  it('without t.js (no window.devcol) → does nothing and does not throw', () => {
    expect(() => track('game_over', { stage: 3, score: 10, duration_ms: 500 })).not.toThrow();
  });

  it('with t.js loaded → forwards type and props to devcol.track', () => {
    const spy = vi.fn();
    g.devcol = { track: spy };
    track('stage_clear', { stage: 5, score: 42 });
    expect(spy).toHaveBeenCalledWith('stage_clear', { stage: 5, score: 42 });
  });

  it('devcol.track throwing → swallowed so the game keeps running', () => {
    g.devcol = { track: () => { throw new Error('boom'); } };
    expect(() => track('game_over', { stage: 1, score: 0, duration_ms: 0 })).not.toThrow();
  });
});

describe('stageOf', () => {
  it('3x3 board → stage 1, expanded 4x4 board → stage 2', () => {
    expect(stageOf({ boardSize: 3 }, 4)).toBe(1);
    expect(stageOf({ boardSize: 4 }, 4)).toBe(2);
  });
});
