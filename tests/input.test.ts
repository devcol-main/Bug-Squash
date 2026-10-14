import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointerInput } from '../src/input/PointerInput';
import { InputQueue } from '../src/input/InputQueue';
import { pointToCell } from '../src/input/pointToCell';
import {
  setVibrationEnabled, vibrateGameOver, vibrateFeatureTap, vibrateMiss,
} from '../src/input/vibration';
import { INPUT_CONFIG } from '../src/input/inputConfig';

const rect = { left: 0, top: 0, width: 400, height: 400 };
const board = { x: 50, y: 50, size: 300 };

describe('pointToCell', () => {
  it('3x3 cell centers map to indices 0..8 row-major', () => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      expect(pointToCell(50 + c * 100 + 50, 50 + r * 100 + 50, rect, board, 3)).toBe(r * 3 + c);
    }
  });
  it('4x4 cell centers map to indices 0..15 row-major', () => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      expect(pointToCell(50 + c * 75 + 37, 50 + r * 75 + 37, rect, board, 4)).toBe(r * 4 + c);
    }
  });
  it('cell boundary belongs to the next cell (left/top inclusive)', () => {
    expect(pointToCell(149.9, 60, rect, board, 3)).toBe(0);
    expect(pointToCell(150, 60, rect, board, 3)).toBe(1);
    expect(pointToCell(60, 150, rect, board, 3)).toBe(3);
  });
  it('board left/top edge is inside, right/bottom edge is outside', () => {
    expect(pointToCell(50, 50, rect, board, 3)).toBe(0);
    expect(pointToCell(349.99, 349.99, rect, board, 3)).toBe(8);
    expect(pointToCell(350, 100, rect, board, 3)).toBe(-1);
    expect(pointToCell(100, 350, rect, board, 3)).toBe(-1);
  });
  it('points outside the board return -1', () => {
    expect(pointToCell(49, 100, rect, board, 3)).toBe(-1);
    expect(pointToCell(100, 49, rect, board, 3)).toBe(-1);
    expect(pointToCell(-10, -10, rect, board, 3)).toBe(-1);
    expect(pointToCell(1000, 1000, rect, board, 3)).toBe(-1);
  });
  it('canvas page offset (letterbox) shifts the mapping', () => {
    const r = { left: 120, top: 80, width: 400, height: 400 };
    expect(pointToCell(120 + 60, 80 + 60, r, board, 3)).toBe(0);
    expect(pointToCell(60, 60, r, board, 3)).toBe(-1);
    expect(pointToCell(120 + 340, 80 + 340, r, board, 3)).toBe(8);
  });
  it('maps using CSS pixels only: fractional rect offsets decide which side of a cell boundary a point is on', () => {
    const r = { left: 10.6667, top: 0.5, width: 400, height: 400 };
    // 열 경계: 10.6667 + 50 + 200 = 260.6667
    expect(pointToCell(260.66, 60, r, board, 3)).toBe(1);
    expect(pointToCell(260.67, 60, r, board, 3)).toBe(2);
    // 행 경계: 0.5 + 50 + 100 = 150.5
    expect(pointToCell(80, 150.4, r, board, 3)).toBe(0);
    expect(pointToCell(80, 150.5, r, board, 3)).toBe(3);
    expect(pointToCell(183.5, 183.5, r, board, 3)).toBe(4);
  });
  it('4x4 column boundary at 125 belongs to the next column', () => {
    expect(pointToCell(124.99, 60, rect, board, 4)).toBe(0);
    expect(pointToCell(125, 60, rect, board, 4)).toBe(1);
  });
  it('4x4 bottom-right inner corner is cell 15 and the far edge is outside', () => {
    expect(pointToCell(349.99, 349.99, rect, board, 4)).toBe(15);
    expect(pointToCell(350, 100, rect, board, 4)).toBe(-1);
    expect(pointToCell(100, 350, rect, board, 4)).toBe(-1);
  });
  it('non-divisible size (100 / 3) still yields index 8 just inside the right/bottom edge', () => {
    const b = { x: 0, y: 0, size: 100 };
    expect(pointToCell(99.999999, 99.999999, rect, b, 3)).toBe(8);
    expect(pointToCell(100, 99, rect, b, 3)).toBe(-1);
  });
  it('NaN coordinates return -1', () => {
    expect(pointToCell(NaN, 100, rect, board, 3)).toBe(-1);
    expect(pointToCell(100, NaN, rect, board, 3)).toBe(-1);
  });
  it('zero-size board returns -1', () => {
    expect(pointToCell(10, 10, rect, { x: 0, y: 0, size: 0 }, 3)).toBe(-1);
  });
});

describe('InputQueue', () => {
  it('two pushed taps drain in insertion order', () => {
    const q = new InputQueue(8);
    q.push(2); q.push(7);
    const got: number[] = [];
    q.drain((c) => got.push(c));
    expect(got).toEqual([2, 7]);
    expect(q.length).toBe(0);
  });
  it('overflow drops new taps and keeps the oldest', () => {
    const q = new InputQueue(2);
    expect(q.push(1)).toBe(true);
    expect(q.push(2)).toBe(true);
    expect(q.push(3)).toBe(false);
    const got: number[] = [];
    q.drain((c) => got.push(c));
    expect(got).toEqual([1, 2]);
  });
  it('ring buffer wraps around after draining', () => {
    const q = new InputQueue(3);
    q.push(1); q.push(2); q.drain(() => {});
    q.push(3); q.push(4); q.push(5);
    const got: number[] = [];
    q.drain((c) => got.push(c));
    expect(got).toEqual([3, 4, 5]);
  });
  it('disabled queue ignores pushes and clears pending taps', () => {
    const q = new InputQueue(4);
    q.push(1);
    q.setEnabled(false);
    expect(q.push(2)).toBe(false);
    q.setEnabled(true);
    const got: number[] = [];
    q.drain((c) => got.push(c));
    expect(got).toEqual([]);
    expect(q.push(3)).toBe(true);
  });
  it('non-integer cells (NaN, fractions) are rejected', () => {
    const q = new InputQueue(4);
    expect(q.push(NaN)).toBe(false);
    expect(q.push(1.5)).toBe(false);
    expect(q.length).toBe(0);
  });
  it('outside-board cell (-1) is not queued', () => {
    const q = new InputQueue(4);
    expect(q.push(-1)).toBe(false);
    expect(q.length).toBe(0);
  });
});

describe('vibration', () => {
  const g = globalThis as { navigator?: unknown };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const stub = (nav: unknown): void => {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  };
  afterEach(() => {
    setVibrationEnabled(true);
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete g.navigator;
  });

  it('supported navigator receives featureTap/miss/gameOver patterns', () => {
    const vibrate = vi.fn(() => true);
    stub({ vibrate });
    vibrateFeatureTap(); vibrateMiss(); vibrateGameOver();
    expect(vibrate).toHaveBeenNthCalledWith(1, INPUT_CONFIG.vibration.featureTap);
    expect(vibrate).toHaveBeenNthCalledWith(2, INPUT_CONFIG.vibration.miss);
    expect(vibrate).toHaveBeenNthCalledWith(3, [...INPUT_CONFIG.vibration.gameOver]);
  });
  it('missing navigator or vibrate is silently ignored', () => {
    stub(undefined);
    expect(() => vibrateFeatureTap()).not.toThrow();
    stub({});
    expect(() => vibrateMiss()).not.toThrow();
  });
  it('vibrate throwing is swallowed', () => {
    stub({ vibrate: () => { throw new Error('nope'); } });
    expect(() => vibrateGameOver()).not.toThrow();
  });
  it('disabled flag suppresses vibration', () => {
    const vibrate = vi.fn(() => true);
    stub({ vibrate });
    setVibrationEnabled(false);
    vibrateFeatureTap();
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('PointerInput', () => {
  const g = globalThis as { document?: unknown };
  const originalDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let doc: EventTarget;
  let canvas: EventTarget & { getBoundingClientRect: () => typeof rect };

  const setup = (): PointerInput => {
    doc = new EventTarget();
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
    canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => rect });
    const pi = new PointerInput(canvas as unknown as HTMLCanvasElement);
    pi.setBoard(board, 3);
    return pi;
  };
  const fire = (type: string, props: Record<string, unknown> = {}, target: EventTarget = canvas): Event => {
    const e = Object.assign(new Event(type, { cancelable: true }), props);
    target.dispatchEvent(e);
    return e;
  };
  const down = (props: Record<string, unknown>): Event => fire('pointerdown', props);
  const drained = (pi: PointerInput): number[] => {
    const out: number[] = [];
    pi.drain((c) => out.push(c));
    return out;
  };

  afterEach(() => {
    if (originalDoc) Object.defineProperty(globalThis, 'document', originalDoc);
    else delete g.document;
  });

  it('two touch pointers with different ids and cells produce two taps', () => {
    const pi = setup();
    down({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, isPrimary: true });
    down({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 300, clientY: 300, isPrimary: false });
    expect(drained(pi)).toEqual([0, 8]);
  });
  it('the same pointerId pressed twice produces two taps', () => {
    const pi = setup();
    const p = { pointerId: 5, pointerType: 'touch', button: 0, clientX: 200, clientY: 200, isPrimary: true };
    down(p); down(p);
    expect(drained(pi)).toEqual([4, 4]);
  });
  it('mouse secondary button is ignored while pen primary button is accepted', () => {
    const pi = setup();
    down({ pointerId: 1, pointerType: 'mouse', button: 2, clientX: 100, clientY: 100, isPrimary: true });
    expect(drained(pi)).toEqual([]);
    down({ pointerId: 2, pointerType: 'pen', button: 0, clientX: 100, clientY: 100, isPrimary: true });
    expect(drained(pi)).toEqual([0]);
  });
  it('pointerdown outside the board queues nothing', () => {
    const pi = setup();
    down({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 10, clientY: 10, isPrimary: true });
    expect(drained(pi)).toEqual([]);
  });
  it('listeners are removed on dispose and default actions are no longer prevented', () => {
    const pi = setup();
    expect(fire('contextmenu').defaultPrevented).toBe(true);
    expect(fire('dblclick').defaultPrevented).toBe(true);
    expect(fire('gesturestart', {}, doc).defaultPrevented).toBe(true);
    pi.dispose();
    down({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, isPrimary: true });
    expect(drained(pi)).toEqual([]);
    expect(fire('contextmenu').defaultPrevented).toBe(false);
    expect(fire('gesturestart', {}, doc).defaultPrevented).toBe(false);
  });
});
