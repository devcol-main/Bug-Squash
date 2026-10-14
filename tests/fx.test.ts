import { describe, expect, it } from 'vitest';
import type { BugSquashEvent, BugSquashEventType, ObjectKind } from '../src/core/BugSquashLogic';
import { createRng } from '../src/core/rng';
import { EndMode, FX_COLORS, FlashStyle, FxState, cellCenter, dissolveCount, dissolveStride, popupText } from '../src/view/fxState';
import { BUG_GRID, FEATURE_GRID, HARD_CRACKED_GRID, pixelCount } from '../src/view/pixelArt';
import { crtOffCurve, endFadeAlpha, glitchOffset, typedChars, type CrtOffState } from '../src/view/fxCurves';
import { TextCache } from '../src/view/fxText';
import { endDuration, motionPolicy } from '../src/view/motionPolicy';
import { UI_CONFIG } from '../src/ui/uiConfig';
import { Pool } from '../src/view/pool';
import { VIEW_CONFIG } from '../src/view/viewConfig';

const FX = VIEW_CONFIG.fx;

function ev(type: BugSquashEventType, cell: number, kind: ObjectKind | null, extra: Partial<BugSquashEvent> = {}): BugSquashEvent {
  return { type, cell, kind, points: 0, multiplier: 1, combo: 0, lives: 3, lifeDelta: 0, ...extra };
}
function buf(...items: BugSquashEvent[]) {
  return { length: items.length, at: (i: number) => items[i]! };
}
const fresh = (grid = 4) => new FxState(createRng(1), grid);
const BUG = FX_COLORS.indexOf(VIEW_CONFIG.colors.bug);
const GOLD = FX_COLORS.indexOf(VIEW_CONFIG.colors.golden);
const RED = FX_COLORS.indexOf(FX.featureColor);

describe('Pool', () => {
  it('allocates the fixed capacity once and never grows', () => {
    const p = new Pool(4, () => ({ active: false }));
    const ref = p.items.slice();
    for (let i = 0; i < 20; i++) p.acquire();
    expect(p.items.length).toBe(4);
    expect(p.items.every((it, i) => it === ref[i])).toBe(true);
  });
  it('full pool -> acquire reuses the oldest-assigned item instead of failing', () => {
    const p = new Pool(3, () => ({ active: false, id: 0 }));
    const a = p.acquire(); a.id = 1;
    p.acquire(); p.acquire();
    const d = p.acquire();
    expect(d).toBe(a);
    expect(p.activeCount).toBe(3);
  });
  it('deactivated item -> is handed out again before overwriting active ones', () => {
    const p = new Pool(3, () => ({ active: false }));
    p.acquire(); const b = p.acquire(); p.acquire();
    b.active = false;
    expect(p.acquire()).toBe(b);
    expect(p.activeCount).toBe(3);
  });
  it('clear -> no active items', () => {
    const p = new Pool(2, () => ({ active: false }));
    p.acquire();
    p.clear();
    expect(p.activeCount).toBe(0);
  });
});

describe('popupText', () => {
  it('lifeDelta > 0 -> +1 LIFE', () => expect(popupText(50, 1)).toBe('+1 LIFE'));
  it('golden without life gain -> +50', () => expect(popupText(50, 0)).toBe('+50'));
  it('normal bug with multiplier -> +20', () => expect(popupText(20, 0)).toBe('+20'));
});

const CYAN = FX_COLORS.indexOf(VIEW_CONFIG.colors.feature);
const HARD = FX_COLORS.indexOf(VIEW_CONFIG.colors.hard);
const active = (fx: FxState) => fx.particles.items.filter((p) => p.active);

describe('FxState.consume', () => {
  it('caught bug -> outline flash, popup and pixel dissolve pieces', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 5, 'bug', { points: 10 })), 4);
    expect(fx.flashes.activeCount).toBe(1);
    expect(fx.popups.activeCount).toBe(1);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+10');
    const f = fx.flashes.items.find((x) => x.active)!;
    expect(f.color).toBe(BUG);
    expect(f.style).toBe(FlashStyle.Outline);
    expect(fx.particles.activeCount).toBeGreaterThan(0);
  });
  it('caught golden with life gain -> invert flash, white pixels and +1 LIFE popup', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50, lifeDelta: 1 })), 4);
    const f = fx.flashes.items.find((x) => x.active)!;
    expect(f.color).toBe(GOLD);
    expect(f.style).toBe(FlashStyle.Invert);
    expect(active(fx).length).toBeGreaterThan(0);
    expect(active(fx).every((p) => p.color === GOLD)).toBe(true);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+1 LIFE');
  });
  it('caught golden at full lives -> +50 popup', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50 })), 4);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+50');
  });
  it('hardHit -> cell glitch only, no popup or pixel pieces', () => {
    const fx = fresh();
    fx.consume(buf(ev('hardHit', 3, 'hard')), 4);
    expect(fx.cellGlitch[3]).toBe(0);
    expect(fx.particles.activeCount + fx.popups.activeCount + fx.flashes.activeCount).toBe(0);
  });
  it('featureTapped -> red invert flash, cyan pixels and a screen glitch', () => {
    const fx = fresh();
    fx.consume(buf(ev('featureTapped', 2, 'feature', { lifeDelta: -1 })), 3);
    const f = fx.flashes.items.find((x) => x.active)!;
    expect(f.color).toBe(RED);
    expect(f.style).toBe(FlashStyle.Invert);
    expect(fx.screenGlitchT).toBe(0);
    expect(active(fx).length).toBeGreaterThan(0);
    expect(active(fx).every((p) => p.color === CYAN)).toBe(true);
  });
  it('missed bug -> red flash, missed golden -> nothing', () => {
    const fx = fresh();
    fx.consume(buf(ev('missed', 1, 'golden')), 4);
    expect(fx.flashes.activeCount).toBe(0);
    fx.consume(buf(ev('missed', 1, 'bug', { lifeDelta: -1 })), 4);
    expect(fx.flashes.activeCount).toBe(1);
    expect(fx.flashes.items.find((f) => f.active)!.color).toBe(RED);
  });
  it('boardExpand -> banner starts', () => {
    const fx = fresh();
    fx.consume(buf(ev('boardExpand', -1, null)), 4);
    expect(fx.bannerT).toBe(0);
  });
  it('gameOver -> CRT off starts', () => {
    const fx = fresh();
    fx.consume(buf(ev('gameOver', -1, null)), 4);
    expect(fx.endT).toBe(0);
    expect(fx.endMode).toBe(EndMode.CrtOff);
    expect(fx.endDuration).toBe(FX.crtOffDuration);
    expect(fx.boardHidden).toBe(false);
  });
  it('gameOver then CRT off finishes -> board stays hidden until reset, reset brings it back', () => {
    const fx = fresh();
    fx.consume(buf(ev('gameOver', -1, null)), 4);
    for (let i = 0; i < 10; i++) fx.update(0.1);
    expect(fx.boardHidden).toBe(true);
    fx.reset(3);
    expect(fx.boardHidden).toBe(false);
    expect(fx.endT).toBe(-1);
  });
  it('spawn, cleared, emptyTap -> no effects', () => {
    const fx = fresh();
    fx.consume(buf(ev('spawn', 0, 'bug'), ev('cleared', 1, 'bug'), ev('emptyTap', 2, null)), 3);
    expect(fx.particles.activeCount + fx.flashes.activeCount + fx.popups.activeCount).toBe(0);
    expect(fx.screenGlitchT).toBe(-1);
  });
  it('update past all durations -> every effect is reclaimed', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50 }), ev('featureTapped', 1, 'feature'), ev('hardHit', 2, 'hard'), ev('boardExpand', -1, null)), 4);
    for (let i = 0; i < 40; i++) fx.update(0.1);
    expect(fx.particles.activeCount + fx.flashes.activeCount + fx.popups.activeCount).toBe(0);
    expect(fx.cellGlitch[2]).toBe(-1);
    expect(fx.screenGlitchT).toBe(-1);
    expect(fx.bannerT).toBe(-1);
  });
  it('16 catches over 0.5s on 4x4 -> all popups are alive, and flashes within their lifetime are not overwritten', () => {
    const fx = fresh(4);
    for (let i = 0; i < 16; i++) {
      fx.consume(buf(ev('caught', i, 'bug', { points: 10 })), 4);
      fx.update(0.5 / 16);
    }
    expect(fx.popups.activeCount).toBe(16);
    // 플래시는 0.22초 수명 -> 마지막 0.22초 안의 잡기 수만큼 살아 있어야 한다 (풀 용량 때문에 잘리지 않음).
    const expected = Math.ceil(FX.flashDuration / (0.5 / 16));
    expect(fx.flashes.activeCount).toBeGreaterThanOrEqual(expected - 1);
    expect(fx.flashes.activeCount).toBeLessThanOrEqual(expected + 1);
    expect(new Set(fx.popups.items.map((p) => p.u + ',' + p.v)).size).toBe(16);
  });
  it('golden sparkle -> spawns particles at the configured rate', () => {
    const fx = fresh();
    fx.sparkle(0.5, 0.5, 0.25, 1);
    expect(fx.particles.activeCount).toBe(FX.sparkleRate);
  });
});

describe('pixel dissolve', () => {
  const sets: [string, 'bug' | 'hard' | 'feature', readonly string[], number][] = [
    ['bug', 'bug', BUG_GRID, BUG],
    ['hard (cracked sprite)', 'hard', HARD_CRACKED_GRID, HARD],
    ['feature', 'feature', FEATURE_GRID, CYAN],
  ];
  for (const [name, kind, grid, color] of sets) {
    it(`catching ${name} -> active pieces equal the sampled filled blocks and use the kind colour`, () => {
      const fx = fresh();
      fx.consume(buf(ev(kind === 'feature' ? 'featureTapped' : 'caught', 0, kind, { points: 10 })), 4);
      const expected = dissolveCount(pixelCount(grid), dissolveStride(1));
      expect(fx.particles.activeCount).toBe(expected);
      expect(expected).toBeLessThanOrEqual(fx.particles.capacity);
      expect(active(fx).every((p) => p.color === color)).toBe(true);
    });
  }
  it('default sampling keeps every 2nd block (about half of the sprite)', () => {
    expect(dissolveStride(1)).toBe(FX.dissolveSampleStep);
    expect(dissolveCount(11, 2)).toBe(6);
  });
  it('pieces fade out within 0.3-0.45s and are all reclaimed afterwards', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'bug', { points: 10 })), 4);
    expect(active(fx).every((p) => p.life >= FX.dissolveLifeMin && p.life <= FX.dissolveLifeMax)).toBe(true);
    fx.update(FX.dissolveLifeMax - 0.01);
    fx.update(0.02);
    expect(fx.particles.activeCount).toBe(0);
  });
  it('pieces start moving away from the cell centre (velocity . offset > 0)', () => {
    const fx = fresh(4);
    fx.consume(buf(ev('caught', 5, 'bug', { points: 10 })), 4);
    const [cu, cv] = cellCenter(5, 4);
    let checked = 0;
    for (const p of active(fx)) {
      const du = p.u - cu;
      const dv = p.v - cv;
      if (du === 0 && dv === 0) continue;
      // 각도 지터(dissolveAngleJitter/2 < 90도)가 있어도 바깥쪽 성분이 양수여야 한다.
      expect(p.vu * du + p.vv * dv).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('update -> vv grows by (vv0 + grav*dt) * damping, so pieces fall under gravity', () => {
    const fx = fresh(4);
    fx.consume(buf(ev('caught', 5, 'bug', { points: 10 })), 4);
    const dt = 0.05;
    const p = active(fx)[0]!;
    const vv0 = p.vv;
    const expected = (vv0 + p.grav * dt) * Math.max(0, 1 - p.drag * dt);
    expect(p.grav).toBeGreaterThan(0);
    fx.update(dt);
    expect(p.vv).toBeCloseTo(expected, 10);
    // 감쇠를 빼고 보면 중력만큼 아래로 가속
    p.drag = 0;
    const v1 = p.vv;
    fx.update(dt);
    expect(p.vv).toBeCloseTo(v1 + p.grav * dt, 10);
  });
  it('reduced on -> fewer pieces (same piece size) than the default, default off keeps the full count', () => {
    const full = fresh();
    expect(full.isReducedMotion).toBe(false);
    full.consume(buf(ev('caught', 0, 'bug', { points: 10 })), 4);
    const reduced = fresh();
    reduced.setReducedMotion(true);
    reduced.consume(buf(ev('caught', 0, 'bug', { points: 10 })), 4);
    expect(reduced.particles.activeCount).toBeLessThan(full.particles.activeCount);
    expect(reduced.particles.activeCount).toBe(dissolveCount(pixelCount(BUG_GRID), dissolveStride(0.5)));
    // 조각 수만 줄고 블록 크기는 그대로다
    expect(active(reduced)[0]!.size).toBe(active(full)[0]!.size);
  });
  it('16 catches in a row -> the particle pool never grows past its capacity', () => {
    const fx = fresh();
    for (let i = 0; i < 16; i++) fx.consume(buf(ev('caught', i, 'hard', { points: 10 })), 4);
    expect(fx.particles.items.length).toBe(FX.particlePool);
    expect(fx.particles.activeCount).toBeLessThanOrEqual(FX.particlePool);
  });
  it('piece size follows the block fraction set for that grid', () => {
    const fx = fresh(4);
    fx.setBlockFrac(4, 0.05);
    fx.consume(buf(ev('caught', 0, 'bug', { points: 10 })), 4);
    expect(active(fx)[0]!.size).toBeCloseTo(0.05 / 4);
  });
});

describe('glitch offset', () => {
  it('after the duration -> exactly 0', () => {
    expect(glitchOffset(0.8, FX.cellGlitchDuration, FX.cellGlitchDuration, 10, true)).toBe(0);
    expect(glitchOffset(0.8, 5, FX.cellGlitchDuration, 10, true)).toBe(0);
  });
  it('during the glitch -> non-zero and shrinking in magnitude', () => {
    const d = FX.cellGlitchDuration;
    const a = Math.abs(glitchOffset(1, 0.001, d, 10, true));
    const b = Math.abs(glitchOffset(1, d * 0.9, d, 10, true));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(a);
  });
  it('reduced (disabled) -> always 0', () => {
    for (const t of [0, 0.05, 0.1]) expect(glitchOffset(1, t, 0.2, 10, false)).toBe(0);
  });
  it('same event-time rng seed -> identical band units and screen glitch layout', () => {
    const a = new FxState(createRng(7), 4);
    const b = new FxState(createRng(7), 4);
    for (const fx of [a, b]) fx.consume(buf(ev('hardHit', 2, 'hard'), ev('featureTapped', 5, 'feature')), 4);
    expect(Array.from(a.cellGlitchUnits)).toEqual(Array.from(b.cellGlitchUnits));
    expect(Array.from(a.screenGlitchEdges)).toEqual(Array.from(b.screenGlitchEdges));
    expect(Array.from(a.screenGlitchUnits)).toEqual(Array.from(b.screenGlitchUnits));
  });
  it('screen glitch edges -> start at 0, end at 1 and increase strictly', () => {
    const fx = fresh();
    fx.consume(buf(ev('featureTapped', 0, 'feature')), 4);
    const e = fx.screenGlitchEdges;
    expect(e[0]).toBe(0);
    expect(e[e.length - 1]).toBe(1);
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeGreaterThan(e[i - 1]!);
  });
  it('screen glitch ends after its duration', () => {
    const fx = fresh();
    fx.consume(buf(ev('featureTapped', 0, 'feature')), 4);
    fx.update(FX.screenGlitchDuration + 0.01);
    expect(fx.screenGlitchT).toBe(-1);
  });
  it('reduced motion -> no cell or screen glitch, a simple flash instead', () => {
    const fx = fresh();
    fx.setReducedMotion(true);
    fx.consume(buf(ev('hardHit', 3, 'hard'), ev('featureTapped', 2, 'feature')), 4);
    expect(fx.cellGlitch[3]).toBe(-1);
    expect(fx.screenGlitchT).toBe(-1);
    expect(fx.flashes.activeCount).toBe(2);
  });
});

describe('banner typing', () => {
  const total = FX.bannerText.length;
  it('time 0 -> nothing typed, typing duration -> the whole text', () => {
    expect(typedChars(0, total, FX.bannerTypeDuration, true)).toBe(0);
    expect(typedChars(FX.bannerTypeDuration, total, FX.bannerTypeDuration, true)).toBe(total);
    expect(typedChars(5, total, FX.bannerTypeDuration, true)).toBe(total);
  });
  it('typed count never decreases and moves through intermediate values', () => {
    let prev = 0;
    const seen = new Set<number>();
    for (let t = 0; t <= FX.bannerTypeDuration; t += 0.01) {
      const n = typedChars(t, total, FX.bannerTypeDuration, true);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(total / 2);
  });
  it('reduced (typing off) -> the full string right away', () => {
    expect(typedChars(0, total, FX.bannerTypeDuration, false)).toBe(total);
  });
  it('banner text is a terminal prompt of 12 characters', () => {
    expect(FX.bannerText).toBe('> SCALING UP');
  });
  it('banner sprites -> one cached sprite per prefix (n = 0..12) plus a no-cursor one, no new sprite on reuse', () => {
    let made = 0;
    const create = (w: number, h: number) => {
      made++;
      const g = { font: '', scale() {}, measureText: (t: string) => ({ width: t.length * 10 }), fillText() {}, set fillStyle(_v: string) {} };
      return { width: w, height: h, getContext: () => g } as unknown as HTMLCanvasElement;
    };
    const cache = new TextCache(create);
    cache.build(300, 1);
    const afterBuild = made;
    for (let n = 0; n <= total; n++) cache.banner(n, true);
    cache.banner(total, false);
    expect(made).toBe(afterBuild);
    expect(cache.banner(3, true)).toBe(cache.banner(3, true));
    expect(cache.banner(total, true)).not.toBe(cache.banner(total, false));
  });
});

describe('game over overlay delay', () => {
  it('default -> CRT off duration, reduced -> fade duration', () => {
    expect(endDuration(motionPolicy(false))).toBe(FX.crtOffDuration);
    expect(endDuration(motionPolicy(true))).toBe(FX.reduced.endFadeDuration);
  });
  it('delay is shorter than the input lock so retry stays locked until the overlay is visible', () => {
    expect(endDuration(motionPolicy(false))).toBeLessThan(UI_CONFIG.gameOverInputLockSec);
    expect(endDuration(motionPolicy(true))).toBeLessThan(UI_CONFIG.gameOverInputLockSec);
  });
});

describe('CRT off curve', () => {
  const out: CrtOffState = { scaleX: 0, scaleY: 0, glow: 0 };
  it('time 0 -> full height and width, at the end -> zero', () => {
    crtOffCurve(0, FX.crtOffDuration, out);
    expect(out.scaleY).toBe(1);
    expect(out.scaleX).toBe(1);
    crtOffCurve(FX.crtOffDuration, FX.crtOffDuration, out);
    expect(out.scaleY).toBe(0);
    expect(out.scaleX).toBe(0);
  });
  it('squash phase end -> thin bright line, then the line shrinks to a point', () => {
    crtOffCurve(FX.crtOffDuration * FX.crtOffSquashPortion, FX.crtOffDuration, out);
    expect(out.scaleY).toBeCloseTo(FX.crtOffLineScale);
    expect(out.scaleX).toBe(1);
    expect(out.glow).toBe(1);
  });
  it('scaleY never increases over time', () => {
    let prev = 2;
    for (let t = 0; t <= FX.crtOffDuration; t += 0.005) {
      crtOffCurve(t, FX.crtOffDuration, out);
      expect(out.scaleY).toBeLessThanOrEqual(prev);
      prev = out.scaleY;
    }
  });
  it('reduced motion -> no CRT off, a short fade instead', () => {
    const fx = fresh();
    fx.setReducedMotion(true);
    fx.consume(buf(ev('gameOver', -1, null)), 4);
    expect(fx.endMode).toBe(EndMode.Fade);
    expect(fx.endDuration).toBeLessThan(FX.crtOffDuration);
    expect(endFadeAlpha(0, fx.endDuration)).toBe(1);
    expect(endFadeAlpha(fx.endDuration, fx.endDuration)).toBe(0);
  });
});

describe('cell mapping and grid tracking', () => {
  it('4x4 cell 5 -> (0.375, 0.375)', () => {
    const [u, v] = cellCenter(5, 4);
    expect(u).toBeCloseTo(0.375);
    expect(v).toBeCloseTo(0.375);
  });
  it('3x3 cell 5 -> (5/6, 1/2)', () => {
    const [u, v] = cellCenter(5, 3);
    expect(u).toBeCloseTo(5 / 6);
    expect(v).toBeCloseTo(0.5);
  });
  it('missed on 3x3 followed by boardExpand in one buffer -> flash uses 3x3 position', () => {
    const fx = fresh(3);
    fx.consume(buf(ev('missed', 5, 'bug', { lifeDelta: -1 }), ev('boardExpand', -1, null)), 4);
    const f = fx.flashes.items.find((x) => x.active)!;
    expect(f.u).toBeCloseTo(5 / 6);
    expect(f.v).toBeCloseTo(0.5);
    expect(f.frac).toBeCloseTo(1 / 3);
  });
  it('after expansion -> later buffers map cells on 4x4', () => {
    const fx = fresh(3);
    fx.consume(buf(ev('boardExpand', -1, null)), 4);
    fx.consume(buf(ev('missed', 5, 'bug', { lifeDelta: -1 })), 4);
    const f = fx.flashes.items.find((x) => x.active)!;
    expect(f.u).toBeCloseTo(0.375);
  });
  it('reset with a grid size -> subsequent events use it', () => {
    const fx = fresh(3);
    fx.reset(4);
    fx.consume(buf(ev('missed', 5, 'bug', { lifeDelta: -1 })), 4);
    expect(fx.flashes.items.find((x) => x.active)!.u).toBeCloseTo(0.375);
  });
});
