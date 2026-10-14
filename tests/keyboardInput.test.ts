import { describe, expect, it } from 'vitest';
import { cellToKeyLabel, keyToCell } from '../src/input/keyToCell';
import { KeyboardInput, shouldAcceptCellKey } from '../src/input/KeyboardInput';
import { InputQueue } from '../src/input/InputQueue';

const ALL = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR',
  'KeyA', 'KeyS', 'KeyD', 'KeyF',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV',
];
const THREE = ['Digit1', 'Digit2', 'Digit3', 'KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD'];

describe('keyToCell', () => {
  it('4x4 maps the 16 keys to cells 0..15 row-major', () => {
    ALL.forEach((code, i) => expect(keyToCell(code, 4)).toBe(i));
  });
  it('3x3 maps the 9 keys to cells 0..8', () => {
    THREE.forEach((code, i) => expect(keyToCell(code, 3)).toBe(i));
  });
  it('3x3 returns -1 for the 7 keys outside the board', () => {
    for (const code of ALL.filter((c) => !THREE.includes(c))) expect(keyToCell(code, 3)).toBe(-1);
  });
  it('unlisted keys return -1', () => {
    for (const code of ['Space', 'KeyM', 'Digit5', 'Numpad1', 'Enter', '']) {
      expect(keyToCell(code, 4)).toBe(-1);
      expect(keyToCell(code, 3)).toBe(-1);
    }
  });
  it('cellToKeyLabel round-trips with keyToCell on both board sizes', () => {
    for (const size of [3, 4]) {
      for (let cell = 0; cell < size * size; cell++) {
        const label = cellToKeyLabel(cell, size);
        const code = /\d/.test(label) ? `Digit${label}` : `Key${label}`;
        expect(keyToCell(code, size)).toBe(cell);
      }
    }
  });
  it('cellToKeyLabel returns empty string for out-of-range cells', () => {
    expect(cellToKeyLabel(9, 3)).toBe('');
    expect(cellToKeyLabel(-1, 4)).toBe('');
  });
});

describe('shouldAcceptCellKey', () => {
  const base = { playing: true, optionsOpen: false, textTarget: false, buttonTarget: false };
  it('playing with no overlay accepts', () => expect(shouldAcceptCellKey(base)).toBe(true));
  it('not playing (title or game over) ignores', () => expect(shouldAcceptCellKey({ ...base, playing: false })).toBe(false));
  it('options panel open ignores', () => expect(shouldAcceptCellKey({ ...base, optionsOpen: true })).toBe(false));
  it('button focus ignores cell keys', () => expect(shouldAcceptCellKey({ ...base, buttonTarget: true })).toBe(false));
  it('text input focus ignores', () => expect(shouldAcceptCellKey({ ...base, textTarget: true })).toBe(false));
});

describe('KeyboardInput', () => {
  const setup = (grid = 3, accept = true) => {
    const target = new EventTarget();
    const queue = new InputQueue(16);
    const state = { accept };
    const ki = new KeyboardInput(target, queue, () => grid, () => state.accept);
    const press = (code: string, props: Record<string, unknown> = {}): Event => {
      const e = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false }, props);
      target.dispatchEvent(e);
      return e;
    };
    const drained = (): number[] => {
      const out: number[] = [];
      queue.drain((c) => out.push(c));
      return out;
    };
    return { ki, press, drained, queue, state };
  };

  it('one keydown pushes one cell and prevents default', () => {
    const { press, drained } = setup(4);
    const e = press('KeyF');
    expect(drained()).toEqual([11]);
    expect(e.defaultPrevented).toBe(true);
  });
  it('IME composition (key is a Hangul letter, code KeyQ) still maps to cell 3 on 3x3', () => {
    const { press, drained } = setup(3);
    press('KeyQ', { key: 'ㅂ', isComposing: true, keyCode: 229 });
    expect(drained()).toEqual([3]);
  });
  it('repeat keydown is ignored', () => {
    const { press, drained } = setup();
    press('KeyQ', { repeat: true });
    expect(drained()).toEqual([]);
  });
  it('ctrl, alt and meta combos are ignored without preventDefault', () => {
    const { press, drained } = setup();
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(press('KeyQ', { [mod]: true }).defaultPrevented).toBe(false);
    }
    expect(drained()).toEqual([]);
  });
  it('two keys pressed before either is released both enter the queue in order', () => {
    const { press, drained } = setup();
    press('KeyQ');
    press('KeyE');
    expect(drained()).toEqual([3, 5]);
  });
  it('rejected state pushes nothing and does not prevent default', () => {
    const { press, drained, state } = setup();
    state.accept = false;
    expect(press('KeyQ').defaultPrevented).toBe(false);
    expect(drained()).toEqual([]);
  });
  it('disabled queue drops keyboard pushes', () => {
    const { press, drained, queue } = setup();
    queue.setEnabled(false);
    press('KeyQ');
    expect(drained()).toEqual([]);
  });
  it('3x3 KeyZ is not queued and does not call preventDefault', () => {
    const { press, drained } = setup(3);
    expect(press('KeyZ').defaultPrevented).toBe(false);
    expect(drained()).toEqual([]);
  });
  it('after dispose keydown is not queued', () => {
    const { ki, press, drained } = setup();
    ki.dispose();
    press('KeyQ');
    expect(drained()).toEqual([]);
  });
});
