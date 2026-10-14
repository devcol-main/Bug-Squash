import { describe, expect, it } from 'vitest';
import { lifeSlotChange, lifeSlotState, multiplierText, multiplierVisible } from '../src/ui/hud';

describe('multiplier display', () => {
  it('x1 is hidden and x2 or higher is shown', () => {
    expect(multiplierVisible(1)).toBe(false);
    expect(multiplierVisible(2)).toBe(true);
    expect(multiplierVisible(4)).toBe(true);
  });
  it('text uses the multiplication sign', () => {
    expect(multiplierText(3)).toBe('×3');
  });
});

describe('life diamonds', () => {
  it('slots below the life count are full and the rest are outlines', () => {
    expect([0, 1, 2].map((i) => lifeSlotState(i, 2))).toEqual(['full', 'full', 'empty']);
    expect([0, 1, 2].map((i) => lifeSlotState(i, 0))).toEqual(['empty', 'empty', 'empty']);
  });
  it('losing a life breaks only the top filled slot', () => {
    expect([0, 1, 2].map((i) => lifeSlotChange(i, 3, 2))).toEqual(['none', 'none', 'break']);
  });
  it('gaining a life from a golden bug restores the refilled slot', () => {
    expect([0, 1, 2].map((i) => lifeSlotChange(i, 1, 2))).toEqual(['none', 'restore', 'none']);
  });
  it('losing the last life breaks the remaining slot, and unchanged lives change nothing', () => {
    expect(lifeSlotChange(0, 1, 0)).toBe('break');
    expect([0, 1, 2].map((i) => lifeSlotChange(i, 3, 3))).toEqual(['none', 'none', 'none']);
  });
});
