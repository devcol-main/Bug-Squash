// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BugSquashEvent } from '../src/core/BugSquashLogic';
import { cellToKeyLabel } from '../src/input/keyToCell';
import { vibrationForEvent } from '../src/ui/vibrationCue';
import { KeyHintCache, keyHintFontPx, keyHintLabels, shouldDrawKeyHint } from '../src/view/keyHints';
import { VIEW_CONFIG } from '../src/view/viewConfig';

const ev = (over: Partial<BugSquashEvent>): BugSquashEvent => ({
  type: 'spawn', cell: 0, kind: 'bug', points: 0, multiplier: 1, combo: 0, lives: 3, lifeDelta: 0, ...over,
});

describe('vibrationForEvent', () => {
  it('emptyTap -> the same miss vibration as a missed bug', () => {
    expect(vibrationForEvent(ev({ type: 'emptyTap', kind: null, lifeDelta: -1 }))).toBe('miss');
    expect(vibrationForEvent(ev({ type: 'missed', kind: 'bug' }))).toBe('miss');
  });
  it('golden missed -> no vibration, feature and game over keep theirs', () => {
    expect(vibrationForEvent(ev({ type: 'missed', kind: 'golden' }))).toBeNull();
    expect(vibrationForEvent(ev({ type: 'featureTapped', kind: 'feature' }))).toBe('featureTap');
    expect(vibrationForEvent(ev({ type: 'gameOver', kind: null }))).toBe('gameOver');
    expect(vibrationForEvent(ev({ type: 'spawn' }))).toBeNull();
  });
});

describe('key hint sprites', () => {
  const fakeCreate = (w: number, h: number): HTMLCanvasElement => {
    const g = { scale() {}, fillText() {}, measureText: () => ({ width: 7 }), font: '', textAlign: '', textBaseline: '', fillStyle: '' };
    return { width: w, height: h, getContext: () => g } as unknown as HTMLCanvasElement;
  };
  it('labels match cellToKeyLabel: 9 for 3x3 and 16 for 4x4', () => {
    expect(keyHintLabels(3)).toHaveLength(9);
    expect(keyHintLabels(4)).toHaveLength(16);
    for (const n of [3, 4]) keyHintLabels(n).forEach((l, i) => expect(l).toBe(cellToKeyLabel(i, n)));
    expect(keyHintLabels(4).join('')).toBe('1234QWERASDFZXCV');
  });
  it('build -> every cell of both grids has a cached sprite, and nothing exists beyond them', () => {
    const c = new KeyHintCache(fakeCreate);
    c.build(300, 2, [3, 4]);
    for (let i = 0; i < 9; i++) expect(c.get(3, i)).toBeDefined();
    for (let i = 0; i < 16; i++) expect(c.get(4, i)).toBeDefined();
    expect(c.get(3, 9)).toBeUndefined();
    expect(c.get(4, 16)).toBeUndefined();
  });
  it('get returns the same sprite object every call (no per-frame creation)', () => {
    const c = new KeyHintCache(fakeCreate);
    c.build(300, 1, [3, 4]);
    expect(c.get(4, 5)).toBe(c.get(4, 5));
  });
  it('small cells keep a readable minimum font, large cells scale with the cell', () => {
    expect(keyHintFontPx(40)).toBe(VIEW_CONFIG.keyHint.minFont);
    expect(keyHintFontPx(200)).toBeCloseTo(200 * VIEW_CONFIG.keyHint.font);
  });
  it('hint text starts at least 2 device px right of the title bar end, below the outline', () => {
    const t = VIEW_CONFIG.cellTitle;
    const barEnd = VIEW_CONFIG.cellInset + VIEW_CONFIG.cellStroke + t.pad + t.dots * (t.dot + t.gap) + t.barW;
    for (const dpr of [1, 2]) {
      const c = new KeyHintCache(fakeCreate);
      c.build(280, dpr, [4]);
      const s = c.get(4, 0)!;
      expect(s.x - 70 * barEnd).toBeGreaterThanOrEqual(2 / dpr);
      expect(s.y).toBeGreaterThanOrEqual(70 * (VIEW_CONFIG.cellInset + VIEW_CONFIG.cellStroke));
      expect(s.x + s.w).toBeLessThan(70);
    }
  });
  it('invalidate after build -> sprites are redrawn as new objects, still present for every cell', () => {
    const c = new KeyHintCache(fakeCreate);
    c.build(300, 1, [3, 4]);
    const a = c.get(3, 0);
    const b = c.get(4, 15);
    c.invalidate();
    expect(c.get(3, 0)).toBeDefined();
    expect(c.get(4, 15)).toBeDefined();
    expect(c.get(3, 0)).not.toBe(a);
    expect(c.get(4, 15)).not.toBe(b);
  });
  it('invalidate before build -> does nothing and does not throw', () => {
    const c = new KeyHintCache(fakeCreate);
    expect(() => c.invalidate()).not.toThrow();
    expect(c.get(3, 0)).toBeUndefined();
  });
  it('hints are drawn only when on and a sprite exists', () => {
    const c = new KeyHintCache(fakeCreate);
    c.build(300, 1, [3]);
    const s = c.get(3, 0);
    expect(shouldDrawKeyHint(false, s)).toBe(false);
    expect(shouldDrawKeyHint(true, undefined)).toBe(false);
    expect(shouldDrawKeyHint(true, s)).toBe(true);
  });
});

describe('title copy', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  it('index.html states the wrong-cell rule and the keyboard keys', () => {
    expect(html).toContain('Squash the bugs. Wrong cell costs a life.');
    expect(html).toContain('Keys: 1-4 Q-R A-F Z-V');
    expect(html).not.toContain('never tap a feature');
  });
});
