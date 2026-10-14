import { describe, expect, it } from 'vitest';
import { expandAnimT, popScale, smoothstep01 } from '../src/view/anim';
import { drawnCellInnerHalf, objectBoundsRatio, type BoundsKind } from '../src/view/objectBounds';
import { VIEW_CONFIG } from '../src/view/viewConfig';
import { cellBox, computeBoardRect, expandCellBox, hudContentBottom, hudHeight, newCellBox, slackBias } from '../src/view/layout';

const SIZES: [number, number][] = [[375, 667], [375, 812], [1280, 720], [800, 600], [360, 640], [800, 400], [320, 568]];

describe('computeBoardRect', () => {
  for (const [w, h] of SIZES) {
    it(`${w}x${h} -> board is square, inside the screen, and below the HUD area`, () => {
      const b = computeBoardRect(w, h);
      expect(b.size).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(hudHeight(h) - 1e-9);
      expect(b.x + b.size).toBeLessThanOrEqual(w + 1e-9);
      expect(b.y + b.size).toBeLessThanOrEqual(h + 1e-9);
      expect(b.size).toBeLessThanOrEqual(Math.min(w, h));
    });
    it(`${w}x${h} -> 4x4 cells tile the board without leaving it`, () => {
      const b = computeBoardRect(w, h);
      const box = newCellBox();
      cellBox(b, 4, 0, box);
      expect(box.cx - box.size / 2).toBeCloseTo(b.x);
      cellBox(b, 4, 15, box);
      expect(box.cx + box.size / 2).toBeCloseTo(b.x + b.size);
      expect(box.cy + box.size / 2).toBeCloseTo(b.y + b.size);
    });
  }

  it('3x3 cell index 4 -> sits at the board center', () => {
    const b = computeBoardRect(375, 667);
    const box = cellBox(b, 3, 4, newCellBox());
    expect(box.cx).toBeCloseTo(b.x + b.size / 2);
    expect(box.cy).toBeCloseTo(b.y + b.size / 2);
    expect(box.size).toBeCloseTo(b.size / 3);
  });

  it('tiny viewport -> never returns a negative size', () => {
    expect(computeBoardRect(50, 50).size).toBeGreaterThanOrEqual(0);
  });
});

describe('popScale', () => {
  it('just spawned -> scale 0', () => {
    expect(popScale(0, 1.4)).toBe(0);
  });
  it('after the pop duration -> scale 1', () => {
    expect(popScale(0.12, 1.28)).toBe(1);
    expect(popScale(0.5, 0.9)).toBe(1);
  });
  it('mid pop-in -> between 0 and 1', () => {
    const s = popScale(0.06, 1.34);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
  it('about to expire -> scale shrinks back to 0', () => {
    expect(popScale(1.4, 0)).toBe(0);
    expect(popScale(1.34, 0.06)).toBeCloseTo(popScale(0.06, 1.34));
  });
  it('out-of-range inputs -> clamped to [0, 1]', () => {
    expect(popScale(-1, 5)).toBe(0);
    expect(popScale(99, -3)).toBe(0);
  });
});

describe('expandCellBox', () => {
  const b = computeBoardRect(375, 667);
  const out = newCellBox();
  it('progress 0 -> cell sits at its 3x3 position', () => {
    expandCellBox(b, 3, 4, 0, 0, out);
    const ref = cellBox(b, 3, 0, newCellBox());
    expect(out.cx).toBeCloseTo(ref.cx);
    expect(out.size).toBeCloseTo(ref.size);
    expect(out.alpha).toBe(1);
  });
  it('progress 1 -> cell sits at its 4x4 position', () => {
    expandCellBox(b, 3, 4, 5, 1, out);
    const ref = cellBox(b, 4, 5, newCellBox());
    expect(out.cx).toBeCloseTo(ref.cx);
    expect(out.cy).toBeCloseTo(ref.cy);
    expect(out.size).toBeCloseTo(ref.size);
  });
  it('progress 0.5 -> halfway between the two layouts', () => {
    expandCellBox(b, 3, 4, 0, 0.5, out);
    const a = cellBox(b, 3, 0, newCellBox());
    const z = cellBox(b, 4, 0, newCellBox());
    expect(out.cx).toBeCloseTo((a.cx + z.cx) / 2);
    expect(out.size).toBeCloseTo((a.size + z.size) / 2);
  });
  it('new last-row cell -> fades in from 0 to 1 and starts at the neighbouring 3x3 cell', () => {
    expandCellBox(b, 3, 4, 15, 0, out);
    expect(out.alpha).toBe(0);
    expect(out.cx).toBeCloseTo(cellBox(b, 3, 8, newCellBox()).cx);
    expandCellBox(b, 3, 4, 15, 1, out);
    expect(out.alpha).toBe(1);
  });
});

describe('smoothstep01', () => {
  it('0, 0.5, 1 -> 0, 0.5, 1 and clamps outside', () => {
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(0.5)).toBeCloseTo(0.5);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(2)).toBe(1);
  });
});

describe('layout rules', () => {
  it('every size -> board is horizontally centered', () => {
    for (const [w, h] of SIZES) {
      const b = computeBoardRect(w, h);
      expect(b.x).toBeCloseTo((w - b.size) / 2);
    }
  });
  it('portrait -> width decides the board size', () => {
    const b = computeBoardRect(375, 667);
    expect(b.size).toBeCloseTo(375 * (1 - 2 * VIEW_CONFIG.sideMarginRatio));
  });
  it('landscape -> height left under the HUD decides the board size', () => {
    const b = computeBoardRect(1280, 720);
    expect(b.size).toBeCloseTo(720 - hudHeight(720) - 720 * VIEW_CONFIG.bottomMarginRatio);
  });
  it('800x400 landscape iframe -> board stays below the HUD and on screen', () => {
    const b = computeBoardRect(800, 400);
    expect(b.y).toBeGreaterThanOrEqual(hudHeight(400) - 1e-9);
    expect(b.y + b.size).toBeLessThanOrEqual(400);
  });
  for (const [w, h] of SIZES) {
    it(`${w}x${h} -> HUD content (score, multiplier, lives, Sound) ends above the board`, () => {
      expect(hudContentBottom(w, h)).toBeLessThanOrEqual(hudHeight(h));
      expect(hudContentBottom(w, h)).toBeLessThanOrEqual(computeBoardRect(w, h).y);
    });
  }
  it('375x667 portrait -> board sits above the vertical center of the free space (closer to the HUD)', () => {
    const b = computeBoardRect(375, 667);
    const top = hudHeight(667);
    const slack = 667 - top - 667 * VIEW_CONFIG.bottomMarginRatio - b.size;
    expect(slack).toBeGreaterThan(0);
    expect(b.y - top).toBeCloseTo(slack * VIEW_CONFIG.slackBias);
    expect(b.y - top).toBeLessThan(slack / 2);
  });
  it('very tall 375x850 -> bias saturates at slackBiasTall, closer to the HUD than on 375x812 and 375x667', () => {
    const tall = computeBoardRect(375, 850);
    const top = hudHeight(850);
    const slack = 850 - top - 850 * VIEW_CONFIG.bottomMarginRatio - tall.size;
    expect((tall.y - top) / slack).toBeCloseTo(VIEW_CONFIG.slackBiasTall);
    expect(slackBias(375, 812)).toBeLessThan(slackBias(375, 667));
    expect(slackBias(375, 850)).toBeLessThan(slackBias(375, 812));
  });
  it('landscape 1280x720 -> no free vertical space, so the bias changes nothing', () => {
    const b = computeBoardRect(1280, 720);
    expect(b.y).toBeCloseTo(hudHeight(720));
  });
  it('320x568 small phone -> board is 94% of the width and fits below the HUD', () => {
    const b = computeBoardRect(320, 568);
    expect(b.size).toBeCloseTo(320 * (1 - 2 * VIEW_CONFIG.sideMarginRatio));
    expect(b.y + b.size).toBeLessThanOrEqual(568 - 568 * VIEW_CONFIG.bottomMarginRatio + 1e-9);
  });
  it('slackBias -> stays between the tall and base values for any aspect ratio', () => {
    for (const [w, h] of [[100, 100], [375, 667], [375, 900], [100, 1000], [0, 100]] as const) {
      const v = slackBias(w, h);
      expect(v).toBeGreaterThanOrEqual(VIEW_CONFIG.slackBiasTall - 1e-9);
      expect(v).toBeLessThanOrEqual(VIEW_CONFIG.slackBias + 1e-9);
    }
  });
  it('50x50 screen -> HUD takes everything so the board size is exactly 0', () => {
    expect(computeBoardRect(50, 50).size).toBe(0);
  });
});

describe('expandAnimT', () => {
  it('progress 0 -> 0', () => expect(expandAnimT(0, 1.5, 0.6)).toBe(0));
  it('progress at the end of the animation share -> 1', () => expect(expandAnimT(0.4, 1.5, 0.6)).toBeCloseTo(1));
  it('progress during the remaining pause -> stays 1', () => {
    expect(expandAnimT(0.7, 1.5, 0.6)).toBe(1);
    expect(expandAnimT(1, 1.5, 0.6)).toBe(1);
  });
  it('halfway through the animation -> 0.5', () => expect(expandAnimT(0.2, 1.5, 0.6)).toBeCloseTo(0.5));
});

describe('object sprite extents', () => {
  const c = VIEW_CONFIG;
  const kinds: BoundsKind[] = ['bug', 'hard', 'golden', 'feature'];
  for (const kind of kinds) {
    it(`${kind} -> top, bottom, left, right all stay within 80% of the drawn cell half-width`, () => {
      const r = objectBoundsRatio(kind, { top: 0, bottom: 0, left: 0, right: 0 });
      expect(r.top).toBeLessThanOrEqual(c.objectMaxRatio);
      expect(r.bottom).toBeLessThanOrEqual(c.objectMaxRatio);
      expect(r.left).toBeLessThanOrEqual(c.objectMaxRatio);
      expect(r.right).toBeLessThanOrEqual(c.objectMaxRatio);
      expect(r.top).toBeGreaterThan(0.4);
    });
    it(`${kind} -> body plus glow fits inside the sprite surface`, () => {
      const r = objectBoundsRatio(kind, { top: 0, bottom: 0, left: 0, right: 0 });
      const maxR = Math.max(r.top, r.bottom, r.left, r.right) * drawnCellInnerHalf();
      expect(maxR + c.objectGlowBlur).toBeLessThanOrEqual(0.5 + c.objectPad);
    });
  }
  it('bug shape -> vertically centered after the offset', () => {
    const r = objectBoundsRatio('bug', { top: 0, bottom: 0, left: 0, right: 0 });
    expect(r.top).toBeCloseTo(r.bottom);
  });
  it('hard bug -> 1.05 to 1.15 times the normal bug', () => {
    const k = c.hardFill / c.bugFill;
    expect(k).toBeGreaterThanOrEqual(1.05);
    expect(k).toBeLessThanOrEqual(1.15);
  });
});
