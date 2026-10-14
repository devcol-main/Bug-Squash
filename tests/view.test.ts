import { describe, expect, it } from 'vitest';
import { expandAnimT, popScale, smoothstep01 } from '../src/view/anim';
import { createRng } from '../src/core/rng';
import { CodeLog, MAX_LINE_UNITS, codeLogRows, codeLogUnitWidth } from '../src/view/codeLog';
import { crtFlickerValue, motionPolicy } from '../src/view/motionPolicy';
import { BUG_GRID, FEATURE_GRID, HARD_CRACKED_GRID, HARD_GRID, gridCols, gridRows, pixelCount } from '../src/view/pixelArt';
import { drawnCellInnerHalf, objectBoundsRatio, objectBoundsRatioPx, pixelBlockPx, type BoundsKind } from '../src/view/objectBounds';
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
  it('bug grid -> centered, so top equals bottom and left equals right', () => {
    const r = objectBoundsRatio('bug', { top: 0, bottom: 0, left: 0, right: 0 });
    expect(r.top).toBeCloseTo(r.bottom);
    expect(r.left).toBeCloseTo(r.right);
  });
  it('hard bug grid -> 1.05 to 1.15 times the normal bug in both width and height', () => {
    const bug = objectBoundsRatio('bug', { top: 0, bottom: 0, left: 0, right: 0 });
    const hard = objectBoundsRatio('hard', { top: 0, bottom: 0, left: 0, right: 0 });
    for (const k of [hard.left / bug.left, hard.top / bug.top]) {
      expect(k).toBeGreaterThanOrEqual(1.05);
      expect(k).toBeLessThanOrEqual(1.15);
    }
  });
  it('drawn cell -> inner half-width reflects the square cell inset and stroke', () => {
    expect(drawnCellInnerHalf()).toBeCloseTo(0.5 - c.cellInset - c.cellStroke);
  });
});

describe('pixel block rounding', () => {
  const kinds: BoundsKind[] = ['bug', 'hard', 'golden', 'feature'];
  it('px 40 to 400 -> the real drawn block grid stays within 80% of the real drawn cell inner half-width', () => {
    for (let px = 40; px <= 400; px++) {
      for (const kind of kinds) {
        const r = objectBoundsRatioPx(kind, px, { top: 0, bottom: 0, left: 0, right: 0 });
        expect(Math.max(r.top, r.left)).toBeLessThanOrEqual(VIEW_CONFIG.objectMaxRatio);
      }
    }
  });
  it('3x3 and 4x4 boards at DPR 1 and 2 -> sprite pixel sizes stay within 80% for every kind', () => {
    for (const board of [280, 320, 375, 520, 720, 1000]) {
      for (const dpr of [1, 2]) {
        for (const n of [3, 4]) {
          const px = Math.max(8, Math.round((board / n) * dpr));
          for (const kind of kinds) {
            const r = objectBoundsRatioPx(kind, px, { top: 0, bottom: 0, left: 0, right: 0 });
            expect(Math.max(r.top, r.left)).toBeLessThanOrEqual(VIEW_CONFIG.objectMaxRatio);
          }
        }
      }
    }
  });
  it('block size -> never exceeds the nominal size and is at least 1', () => {
    for (let px = 8; px <= 400; px++) {
      expect(pixelBlockPx(px)).toBeLessThanOrEqual(Math.max(1, px * VIEW_CONFIG.pixelBlock));
      expect(pixelBlockPx(px)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('pixel art grids', () => {
  const grids = { bug: BUG_GRID, hard: HARD_GRID, hardCracked: HARD_CRACKED_GRID, feature: FEATURE_GRID };
  for (const [name, g] of Object.entries(grids)) {
    it(`${name} grid -> is rectangular and not empty`, () => {
      expect(g.length).toBeGreaterThan(0);
      for (const row of g) expect(row.length).toBe(g[0]!.length);
      expect(pixelCount(g)).toBeGreaterThan(0);
    });
    it(`${name} grid -> is left-right symmetric except the cracked variant`, () => {
      if (name === 'hardCracked') return;
      for (const row of g) expect(row).toBe(row.split('').reverse().join(''));
    });
  }
  it('cracked hard grid -> same size as the hard grid with fewer pixels', () => {
    expect(gridCols(HARD_CRACKED_GRID)).toBe(gridCols(HARD_GRID));
    expect(gridRows(HARD_CRACKED_GRID)).toBe(gridRows(HARD_GRID));
    expect(pixelCount(HARD_CRACKED_GRID)).toBeLessThan(pixelCount(HARD_GRID));
  });
  it('hard grid -> larger than the bug grid', () => {
    expect(gridCols(HARD_GRID)).toBeGreaterThan(gridCols(BUG_GRID));
    expect(gridRows(HARD_GRID)).toBeGreaterThan(gridRows(BUG_GRID));
  });
  it('bug and hard grids -> taller than wide', () => {
    expect(gridRows(BUG_GRID)).toBeGreaterThanOrEqual(gridCols(BUG_GRID) + 2);
    expect(gridRows(HARD_GRID)).toBeGreaterThan(gridCols(HARD_GRID));
  });
  it('bug and hard grids -> bottom row is one unbroken run of filled pixels', () => {
    for (const g of [BUG_GRID, HARD_GRID]) {
      expect(g[g.length - 1]!.replace(/^\.+|\.+$/g, '')).toMatch(/^#+$/);
    }
  });
  it('bug grid -> no closed empty cell inside the body (no eyes or face)', () => {
    expect(closedEmptyCells(BUG_GRID)).toBe(0);
  });
  it('hard grid -> the middle of the shell is solid, only the 1-block ring is empty and closed', () => {
    const mid = HARD_GRID.slice(8, 11).map((r) => r.slice(2, gridCols(HARD_GRID) - 2));
    for (const r of mid) expect(r).toMatch(/^#+$/);
  });
  it('cracked hard grid -> the crack opens the middle of the shell', () => {
    expect(HARD_CRACKED_GRID[8]!.slice(5, 7)).toBe('..');
  });
  it('feature grid -> pixel overlap with the bug silhouette is low (IoU under 0.6)', () => {
    const iou = overlapRatio(FEATURE_GRID, BUG_GRID);
    expect(iou).toBeLessThan(0.6);
  });
  it('feature grid -> aspect ratio is square while the bug is clearly taller', () => {
    expect(gridCols(FEATURE_GRID)).toBe(gridRows(FEATURE_GRID));
    expect(gridRows(BUG_GRID) / gridCols(BUG_GRID)).toBeGreaterThan(1.15);
  });
});

function closedEmptyCells(g: readonly string[]): number {
  const R = g.length, C = g[0]!.length;
  const seen = new Set<number>();
  const stack: number[] = [];
  const push = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= R || c >= C || g[r]![c] !== '.' || seen.has(r * C + c)) return;
    seen.add(r * C + c);
    stack.push(r * C + c);
  };
  for (let r = 0; r < R; r++) { push(r, 0); push(r, C - 1); }
  for (let c = 0; c < C; c++) { push(0, c); push(R - 1, c); }
  while (stack.length) {
    const v = stack.pop()!;
    const r = Math.floor(v / C), c = v % C;
    push(r + 1, c); push(r - 1, c); push(r, c + 1); push(r, c - 1);
  }
  let closed = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (g[r]![c] === '.' && !seen.has(r * C + c)) closed++;
  return closed;
}

/** 두 그리드를 같은 중심으로 겹쳤을 때 IoU (교집합 / 합집합). */
function overlapRatio(a: readonly string[], b: readonly string[]): number {
  const R = Math.max(a.length, b.length), C = Math.max(a[0]!.length, b[0]!.length);
  const at = (g: readonly string[], r: number, c: number) => {
    const r0 = r - Math.floor((R - g.length) / 2), c0 = c - Math.floor((C - g[0]!.length) / 2);
    return g[r0]?.[c0] === '#';
  };
  let inter = 0, uni = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const x = at(a, r, c), y = at(b, r, c);
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return inter / uni;
}

describe('CodeLog', () => {
  const L = VIEW_CONFIG.codeLog;
  const make = () => new CodeLog(createRng(7));
  const lens = (log: CodeLog) => [log.barCount.length, log.indent.length, log.alpha.length, log.total.length, log.barLen.length];

  it('many steps -> ring buffer arrays keep their fixed size', () => {
    const log = make();
    const sizes = lens(log);
    log.update(L.stepInterval * 500);
    expect(lens(log)).toEqual(sizes);
    expect(log.head).toBeGreaterThanOrEqual(0);
    expect(log.head).toBeLessThan(log.capacity);
  });
  it('one step interval -> head advances by one line (lines move up)', () => {
    const log = make();
    const before = log.slotAt(0);
    log.update(L.stepInterval);
    expect(log.pushed).toBe(1);
    expect(log.slotAt(1)).toBe(before);
  });
  it('less than one interval -> no new line yet', () => {
    const log = make();
    log.update(L.stepInterval * 0.9);
    expect(log.pushed).toBe(0);
  });
  it('bottom line -> typing progress grows with time and caps at 1', () => {
    const log = make();
    expect(log.typedFraction()).toBe(0);
    log.update(L.stepInterval * L.typeFraction * 0.5);
    expect(log.typedFraction()).toBeCloseTo(0.5);
    const done = make();
    done.update(L.stepInterval * (L.typeFraction + 0.1));
    expect(done.pushed).toBe(0);
    expect(done.typedFraction()).toBe(1);
  });
  it('new line -> typing restarts from 0', () => {
    const log = make();
    log.update(L.stepInterval * 1.1);
    expect(log.typedFraction()).toBeLessThan(0.2);
  });
  it('dt 0 or negative -> nothing changes', () => {
    const log = make();
    log.update(0.3);
    const snap = [log.head, log.pushed, log.typedFraction()];
    log.update(0);
    log.update(-1);
    expect([log.head, log.pushed, log.typedFraction()]).toEqual(snap);
  });
  it('every generated line -> indent, bar count, bar lengths and alpha stay in range', () => {
    const log = make();
    log.update(L.stepInterval * 300);
    for (let i = 0; i < log.capacity; i++) {
      expect(log.indent[i]).toBeLessThanOrEqual(L.maxIndent);
      expect(log.barCount[i]).toBeGreaterThanOrEqual(1);
      expect(log.barCount[i]).toBeLessThanOrEqual(L.maxBars);
      for (let b = 0; b < log.barCount[i]!; b++) {
        expect(log.barLen[i * L.maxBars + b]).toBeGreaterThanOrEqual(L.minLen);
        expect(log.barLen[i * L.maxBars + b]).toBeLessThanOrEqual(L.maxLen);
      }
      expect(log.alpha[i]).toBeGreaterThanOrEqual(L.alphaMin);
      expect(log.alpha[i]).toBeLessThanOrEqual(L.alphaMax);
    }
  });
});

describe('CodeLog layout', () => {
  const L = VIEW_CONFIG.codeLog;
  it('any screen width -> the longest possible line reaches 70 to 90 percent of the width', () => {
    for (const w of [320, 375, 800, 1280, 1920]) {
      const frac = (codeLogUnitWidth(w) * MAX_LINE_UNITS) / w;
      expect(frac).toBeGreaterThanOrEqual(0.7);
      expect(frac).toBeLessThanOrEqual(0.9);
    }
  });
  it('tall screens -> rows cover the whole height, capped by the ring buffer capacity', () => {
    expect(codeLogRows(900) * L.lineHeight).toBeGreaterThanOrEqual(900);
    expect(codeLogRows(1e6)).toBe(L.maxLines);
  });
});

describe('CRT flicker', () => {
  it('reduced motion -> flicker is always 0', () => {
    for (const t of [0, 0.3, 1.7, 55]) expect(crtFlickerValue(motionPolicy(true), t)).toBe(0);
  });
  it('normal motion -> stays within the plus/minus 2 percent range and actually varies', () => {
    const vals: number[] = [];
    for (let t = 0; t < 10; t += 0.05) vals.push(crtFlickerValue(motionPolicy(false), t));
    for (const v of vals) expect(Math.abs(v)).toBeLessThanOrEqual(VIEW_CONFIG.crt.flickerAmp + 1e-12);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.01);
  });
});
