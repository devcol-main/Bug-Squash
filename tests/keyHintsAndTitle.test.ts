// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BugSquashEvent } from '../src/core/BugSquashLogic';
import { cellToKeyLabel } from '../src/input/keyToCell';
import { vibrationForEvent } from '../src/ui/vibrationCue';
import { cellSpritePx, cellTitleMetricsPx } from '../src/view/objectBounds';
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
    for (const dpr of [1, 1.5, 2]) {
      const c = new KeyHintCache(fakeCreate);
      c.build(280, dpr, [4]);
      const s = c.get(4, 0)!;
      // sprites.ts 와 같은 반올림(공유 함수)으로 계산한 막대 끝 (CSS px)
      const barEndCss = cellTitleMetricsPx(cellSpritePx(70, dpr)).barEnd / dpr;
      expect(s.x - barEndCss).toBeGreaterThanOrEqual(2 / dpr - 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(70 * (VIEW_CONFIG.cellInset + VIEW_CONFIG.cellStroke));
      expect(s.x + s.w).toBeLessThan(70);
    }
  });
  it('non-integer cell device size (rounding changes the bar end) -> still keeps the 2 device px gap', () => {
    // 칸 70.3 css px * 1.5 = 105.45 -> 105 로 반올림
    const dpr = 1.5;
    const board = 70.3 * 4;
    expect(70.3 * dpr).not.toBe(cellSpritePx(70.3, dpr));
    const c = new KeyHintCache(fakeCreate);
    c.build(board, dpr, [4]);
    const s = c.get(4, 0)!;
    const px = cellSpritePx(board / 4, dpr);
    const m = cellTitleMetricsPx(px);
    // 힌트 x 는 칸 css 폭 비율이고 그릴 때 sprites 의 칸 크기(px/dpr)로 스케일된다
    const k = px / dpr / (board / 4);
    expect(s.x * k - m.barEnd / dpr).toBeGreaterThanOrEqual(2 / dpr - 1e-9);
  });
  it('tiny cells hit the 8 px sprite minimum -> hint still sits right of the bar end', () => {
    const dpr = 1;
    const board = 4 * 5; // 칸 5 css px -> 스프라이트 최소 8px
    expect(cellSpritePx(board / 4, dpr)).toBe(8);
    const c = new KeyHintCache(fakeCreate);
    c.build(board, dpr, [4]);
    const s = c.get(4, 0)!;
    const m = cellTitleMetricsPx(8);
    const k = 8 / dpr / (board / 4);
    expect(s.x * k - m.barEnd / dpr).toBeGreaterThanOrEqual(2 / dpr - 1e-9);
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
