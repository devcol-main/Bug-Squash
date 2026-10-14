import { describe, expect, it } from 'vitest';
import { BugSquashLogic } from '../src/core/BugSquashLogic';
import { createRng } from '../src/core/rng';
import { InputQueue } from '../src/input/InputQueue';
import { FrameClock } from '../src/ui/frameClock';
import { PauseController } from '../src/ui/pause';
import { watchDpr, type MediaQueryLike } from '../src/ui/dprWatcher';
import { expandFadeAlphas, motionPolicy } from '../src/view/motionPolicy';
import { FxState } from '../src/view/fxState';
import { VIEW_CONFIG } from '../src/view/viewConfig';
import { expandAnimT } from '../src/view/anim';
import { DEFAULT_CONFIG } from '../src/core/config';

function setup() {
  const clock = new FrameClock(0.1);
  const queue = new InputQueue(8);
  const calls: string[] = [];
  const pause = new PauseController(clock, {
    clearInput: () => { queue.clear(); calls.push('clear'); },
    suspendAudio: () => calls.push('suspend'),
    resumeAudio: () => calls.push('resume'),
  });
  return { clock, queue, calls, pause };
}

/** main.ts 프레임 루프와 같은 규칙: paused면 update를 건너뛴다. */
function frame(s: ReturnType<typeof setup>, logic: BugSquashLogic, now: number): void {
  const dt = s.clock.tick(now);
  if (s.pause.paused) return;
  logic.update(dt);
}

describe('pause', () => {
  it('hidden for a minute with live bugs -> game time, bug timers and lives stay unchanged', () => {
    const s = setup();
    const logic = new BugSquashLogic(createRng(1));
    frame(s, logic, 0);
    for (let t = 16; t <= 1000; t += 16) frame(s, logic, t);
    logic.forceSpawn(0, 'bug', 1);
    const time = logic.time;
    const lives = logic.lives;
    const remaining = logic.getCell(0).remaining;
    s.pause.set(true);
    for (let t = 1016; t <= 61_000; t += 1000) frame(s, logic, t);
    expect(logic.time).toBe(time);
    expect(logic.lives).toBe(lives);
    expect(logic.getCell(0).remaining).toBe(remaining);
  });

  it('after returning -> first frame dt is 0, bug does not expire, then time resumes normally', () => {
    const s = setup();
    const logic = new BugSquashLogic(createRng(1));
    frame(s, logic, 0);
    logic.forceSpawn(0, 'bug', 1);
    s.pause.set(true);
    s.pause.set(false);
    const lives = logic.lives;
    const dt = s.clock.tick(120_000);
    expect(dt).toBe(0);
    logic.update(dt);
    expect(logic.lives).toBe(lives);
    expect(logic.getCell(0).kind).toBe('bug');
    expect(s.clock.tick(120_016)).toBeCloseTo(0.016, 6);
  });

  it('even if a raw hidden-time tick leaks in, dt is capped so a bug with 1s left survives it', () => {
    const s = setup();
    const logic = new BugSquashLogic(createRng(1));
    s.clock.tick(0);
    logic.forceSpawn(0, 'bug', 1);
    const lives = logic.lives;
    const dt = s.clock.tick(60_000);
    expect(dt).toBeLessThanOrEqual(0.1);
    logic.update(dt);
    expect(logic.lives).toBe(lives);
    expect(logic.getCell(0).kind).toBe('bug');
    expect(logic.getCell(0).remaining).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it('input queued while hidden -> discarded on pause and on resume', () => {
    const s = setup();
    s.queue.push(3);
    s.pause.set(true);
    expect(s.queue.length).toBe(0);
    s.queue.push(4);
    s.pause.set(false);
    expect(s.queue.length).toBe(0);
  });

  it('pause then resume -> audio suspended then resumed once each; repeated same-state calls are ignored', () => {
    const s = setup();
    s.pause.set(false);
    s.pause.set(true);
    s.pause.set(true);
    s.pause.set(false);
    s.pause.set(false);
    expect(s.calls).toEqual(['clear', 'suspend', 'clear', 'resume']);
  });
});

describe('motion policy', () => {
  it('reduced on -> glitch, CRT off and typing are disabled, and the screen never glitches', () => {
    const r = motionPolicy(true);
    expect([r.glitch, r.crtOff, r.typing]).toEqual([false, false, false]);
    const fx = new FxState(createRng(1));
    fx.setReducedMotion(true);
    fx.consume({ length: 1, at: () => ({ type: 'featureTapped', cell: 0, kind: 'feature', points: 0, lifeDelta: 0 }) } as never, 3);
    expect(fx.screenGlitchT).toBe(-1);
  });
  it('reduced off -> full policy (glitch, CRT off, typing on, particles 1, sparkle 1, no fade)', () => {
    const p = motionPolicy(false);
    expect([p.particleScale, p.sparkleScale]).toEqual([1, 1]);
    expect([p.glitch, p.crtOff, p.typing]).toEqual([true, true, true]);
    expect(p.fadeExpand).toBe(false);
    expect(p.expandDuration).toBe(VIEW_CONFIG.expandAnimDuration);
  });
  it('reduced on -> fewer pieces (same piece size), rarer golden sparkles', () => {
    const p = motionPolicy(true);
    expect(p.particleScale).toBeLessThan(1);
    const sizes = [false, true].map((r) => {
      const fx = new FxState(createRng(1), 4);
      fx.setReducedMotion(r);
      fx.consume({ length: 1, at: () => ({ type: 'caught', cell: 0, kind: 'bug', points: 10, lifeDelta: 0 }) } as never, 4);
      return fx.particles.items.find((q) => q.active)!.size;
    });
    expect(sizes[1]).toBe(sizes[0]);
    expect(p.sparkleScale).toBeLessThan(p.particleScale + 1e-9);
    expect(p.sparkleScale).toBeLessThan(1);
  });
  it('reduced on -> board expansion uses a short fade (0.25s) instead of cell movement', () => {
    const p = motionPolicy(true);
    expect(p.fadeExpand).toBe(true);
    expect(p.expandDuration).toBe(0.25);
    expect(p.expandDuration).toBeLessThan(VIEW_CONFIG.expandAnimDuration);
  });
  it('expand fade alpha -> old 3x3 goes 1 -> 0.5 -> 0 while new 4x4 goes 0 -> 0.5 -> 1', () => {
    const o = { old: 0, next: 0 };
    expect(expandFadeAlphas(0, o)).toEqual({ old: 1, next: 0 });
    expect(expandFadeAlphas(0.5, o)).toEqual({ old: 0.5, next: 0.5 });
    expect(expandFadeAlphas(1, o)).toEqual({ old: 0, next: 1 });
    expect(expandFadeAlphas(7, o)).toEqual({ old: 0, next: 1 });
  });
  it('reduced expansion -> fade finishes 0.25s into the core pause, long before the pause ends', () => {
    const d = motionPolicy(true).expandDuration;
    const pause = DEFAULT_CONFIG.expandPause;
    expect(expandAnimT(0, pause, d)).toBe(0);
    expect(expandAnimT(0.125 / pause, pause, d)).toBeCloseTo(0.5);
    expect(expandAnimT(0.25 / pause, pause, d)).toBeCloseTo(1);
    expect(expandAnimT(1, pause, d)).toBe(1);
  });
});

describe('watchDpr', () => {
  function fakeMatchMedia() {
    const queries: { q: string; handlers: Set<() => void> }[] = [];
    const mm = (q: string): MediaQueryLike => {
      const entry = { q, handlers: new Set<() => void>() };
      queries.push(entry);
      return {
        matches: true,
        addEventListener: (_t, cb) => entry.handlers.add(cb),
        removeEventListener: (_t, cb) => entry.handlers.delete(cb),
      };
    };
    return { mm, queries };
  }

  it('DPR change -> callback fires and the listener is re-registered with the new DPR', () => {
    const { mm, queries } = fakeMatchMedia();
    let dpr = 1;
    let n = 0;
    watchDpr(mm, () => dpr, () => n++);
    expect(queries[0]!.q).toBe('(resolution: 1dppx)');
    dpr = 2;
    queries[0]!.handlers.forEach((h) => h());
    expect(n).toBe(1);
    expect(queries[1]!.q).toBe('(resolution: 2dppx)');
    expect(queries[0]!.handlers.size).toBe(0);
    dpr = 1;
    queries[1]!.handlers.forEach((h) => h());
    expect(n).toBe(2);
    expect(queries[2]!.q).toBe('(resolution: 1dppx)');
  });
  it('dispose -> removes the listener, and a late event neither calls back nor re-registers', () => {
    const { mm, queries } = fakeMatchMedia();
    let n = 0;
    const stop = watchDpr(mm, () => 1, () => n++);
    const lateHandler = [...queries[0]!.handlers][0]!;
    stop();
    expect(queries[0]!.handlers.size).toBe(0);
    lateHandler();
    expect(n).toBe(0);
    expect(queries).toHaveLength(1);
  });
  it('matchMedia unavailable -> does nothing and returns a no-op disposer', () => {
    expect(() => watchDpr(null, () => 1, () => {})()).not.toThrow();
  });
});
