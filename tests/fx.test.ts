import { describe, expect, it } from 'vitest';
import type { BugSquashEvent, BugSquashEventType, ObjectKind } from '../src/core/BugSquashLogic';
import { createRng } from '../src/core/rng';
import { GhostMode } from '../src/view/fxState';
import { FX_COLORS, FxState, cellCenter, popupText } from '../src/view/fxState';
import { Pool } from '../src/view/pool';
import { shakeAmplitude, shakeOffset } from '../src/view/shake';
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

describe('shake', () => {
  it('elapsed 0 -> full amplitude', () => expect(shakeAmplitude(0, 0.3, 2)).toBe(2));
  it('elapsed >= duration -> zero', () => {
    expect(shakeAmplitude(0.3, 0.3, 2)).toBe(0);
    expect(shakeAmplitude(5, 0.3, 2)).toBe(0);
  });
  it('amplitude decreases monotonically over time', () => {
    expect(shakeAmplitude(0.1, 0.3, 1)).toBeGreaterThan(shakeAmplitude(0.2, 0.3, 1));
  });
  it('offset after duration -> exactly zero', () => {
    const o = shakeOffset(1, 0.3, 1, 70, 50, { x: 9, y: 9 });
    expect(o.x).toBe(0);
    expect(o.y).toBe(0);
  });
});

describe('popupText', () => {
  it('lifeDelta > 0 -> +1 LIFE', () => expect(popupText(50, 1)).toBe('+1 LIFE'));
  it('golden without life gain -> +50', () => expect(popupText(50, 0)).toBe('+50'));
  it('normal bug with multiplier -> +20', () => expect(popupText(20, 0)).toBe('+20'));
});

describe('FxState.consume', () => {
  it('caught bug -> ghost, flash, popup and particles, no ring', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 5, 'bug', { points: 10 })), 4);
    expect(fx.ghosts.activeCount).toBe(1);
    expect(fx.flashes.activeCount).toBe(1);
    expect(fx.popups.activeCount).toBe(1);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+10');
    expect(fx.particles.activeCount).toBe(FX.catchParticles);
    expect(fx.rings.activeCount).toBe(0);
    expect(fx.flashes.items.find((f) => f.active)!.color).toBe(BUG);
  });
  it('caught golden with life gain -> ring and +1 LIFE popup', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50, lifeDelta: 1 })), 4);
    expect(fx.rings.activeCount).toBe(1);
    expect(fx.flashes.items.find((f) => f.active)!.color).toBe(GOLD);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+1 LIFE');
  });
  it('caught golden at full lives -> +50 popup', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50 })), 4);
    expect(fx.popups.items.find((p) => p.active)!.text).toBe('+50');
  });
  it('hardHit -> cell shake only, no ghost or popup', () => {
    const fx = fresh();
    fx.consume(buf(ev('hardHit', 3, 'hard')), 4);
    expect(fx.cellShake[3]).toBe(0);
    expect(fx.ghosts.activeCount + fx.popups.activeCount).toBe(0);
  });
  it('featureTapped -> red flash, gear ghost and screen shake', () => {
    const fx = fresh();
    fx.consume(buf(ev('featureTapped', 2, 'feature', { lifeDelta: -1 })), 3);
    expect(fx.flashes.items.find((f) => f.active)!.color).toBe(RED);
    expect(fx.ghosts.items.find((g) => g.active)!.mode).toBe(GhostMode.Gear);
    expect(fx.shakeDuration).toBeGreaterThan(0);
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
  it('gameOver -> screen shake', () => {
    const fx = fresh();
    fx.consume(buf(ev('gameOver', -1, null)), 4);
    expect(fx.shakeDuration).toBeGreaterThan(0);
  });
  it('spawn, cleared, emptyTap -> no effects', () => {
    const fx = fresh();
    fx.consume(buf(ev('spawn', 0, 'bug'), ev('cleared', 1, 'bug'), ev('emptyTap', 2, null)), 3);
    expect(fx.particles.activeCount + fx.flashes.activeCount + fx.ghosts.activeCount + fx.popups.activeCount).toBe(0);
  });
  it('update past all durations -> every effect is reclaimed', () => {
    const fx = fresh();
    fx.consume(buf(ev('caught', 0, 'golden', { points: 50 }), ev('featureTapped', 1, 'feature'), ev('hardHit', 2, 'hard'), ev('boardExpand', -1, null)), 4);
    for (let i = 0; i < 40; i++) fx.update(0.1);
    expect(fx.particles.activeCount + fx.flashes.activeCount + fx.ghosts.activeCount + fx.popups.activeCount + fx.rings.activeCount).toBe(0);
    expect(fx.cellShake[2]).toBe(-1);
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
  it('reduced motion on -> particle count shrinks, default off keeps full count', () => {
    const fx = fresh();
    expect(fx.isReducedMotion).toBe(false);
    fx.setReducedMotion(true);
    fx.consume(buf(ev('caught', 0, 'bug', { points: 10 })), 4);
    expect(fx.particles.activeCount).toBeLessThan(FX.catchParticles);
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
