import { describe, expect, it } from 'vitest';
import { checkboxText, lifeSlotChange, lifeSlotState, muteButtonText, muteLogoGapU, MUTE_LAYOUT, multiplierText, multiplierVisible, shouldBlinkMultiplier } from '../src/ui/hud';

describe('multiplier display', () => {
  it('x1 is hidden and x2 or higher is shown', () => {
    expect(multiplierVisible(1)).toBe(false);
    expect(multiplierVisible(2)).toBe(true);
    expect(multiplierVisible(4)).toBe(true);
  });
  it('text uses a plain x prefix', () => {
    expect(multiplierText(2)).toBe('x2');
    expect(multiplierText(3)).toBe('x3');
  });
  it('multiplier rising to x2 or higher triggers the inverted blink', () => {
    expect(shouldBlinkMultiplier(1, 2)).toBe(true);
    expect(shouldBlinkMultiplier(2, 3)).toBe(true);
  });
  it('multiplier staying, dropping, or resetting to x1 does not blink', () => {
    expect(shouldBlinkMultiplier(2, 2)).toBe(false);
    expect(shouldBlinkMultiplier(3, 2)).toBe(false);
    expect(shouldBlinkMultiplier(3, 1)).toBe(false);
    expect(shouldBlinkMultiplier(1, 1)).toBe(false);
  });
});

describe('terminal button text', () => {
  it('checkbox shows [x] when on and [ ] when off', () => {
    expect(checkboxText(true)).toBe('[x] On');
    expect(checkboxText(false)).toBe('[ ] Off');
  });
  it('sound button uses bracket notation for both states', () => {
    expect(muteButtonText(false)).toBe('[Sound: on]');
    expect(muteButtonText(true)).toBe('[Sound: off]');
  });
});

describe('life blocks', () => {
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

describe('sound button spacing', () => {
  it('both sound labels keep at least 4u from the BUG SQUASH text', () => {
    expect(muteLogoGapU(muteButtonText(false))).toBeGreaterThanOrEqual(MUTE_LAYOUT.minGapU);
    expect(muteLogoGapU(muteButtonText(true))).toBeGreaterThanOrEqual(MUTE_LAYOUT.minGapU);
  });
  it('the old spaced bracket label would have been too close', () => {
    expect(muteLogoGapU('[ Sound: off ]')).toBeLessThan(MUTE_LAYOUT.minGapU);
  });
});
