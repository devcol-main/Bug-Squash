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
  // u = min(1vw, 0.5625vh): 375px 폭 세로 폰 3.75, 320px 폭 3.2, 높이 360px 가로 폰 약 2.03, 여유를 둔 2
  const uPxs = [3.75, 3.2, 2.03, 2];
  it('both sound labels keep at least 4u from the BUG SQUASH text for realistic u sizes', () => {
    for (const uPx of uPxs) {
      for (const muted of [false, true]) {
        expect(muteLogoGapU(muteButtonText(muted), uPx)).toBeGreaterThanOrEqual(MUTE_LAYOUT.minGapU);
      }
    }
  });
  it('the button border (2px) narrows the gap, more when u is small', () => {
    const label = muteButtonText(true);
    const wide = muteLogoGapU(label, 1000); // 테두리 영향 거의 없음
    const narrow = muteLogoGapU(label, 2);
    expect(wide - narrow).toBeCloseTo(MUTE_LAYOUT.borderPx / 2 - MUTE_LAYOUT.borderPx / 1000, 9);
  });
  it('safeRightU inset shrinks the gap one-to-one', () => {
    const label = muteButtonText(true);
    expect(muteLogoGapU(label, 3.75, 0) - muteLogoGapU(label, 3.75, 1.5)).toBeCloseTo(1.5, 9);
  });
  it('the old spaced bracket label would have been too close', () => {
    expect(muteLogoGapU('[ Sound: off ]', 3.75)).toBeLessThan(MUTE_LAYOUT.minGapU);
  });
});
