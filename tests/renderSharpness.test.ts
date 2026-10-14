// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { layerSpan, newSnappedSquare, scanlineParams, snapDown, snapSquareEven } from '../src/view/pixelSnap';
import { VIEW_CONFIG } from '../src/view/viewConfig';

const onGrid = (v: number, dpr: number): boolean => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6;

describe('layer span (F)', () => {
  for (const dpr of [1, 1.5, 2]) {
    it(`dpr ${dpr}: layer start lands on the device pixel grid and height is whole device px`, () => {
      for (const raw of [100, 100.4, 133.3, 201.7]) {
        const s = layerSpan(raw, raw + 300.5, 2000, dpr);
        expect(onGrid(s.y0, dpr)).toBe(true);
        expect(s.y0).toBeLessThanOrEqual(raw);
        expect(Number.isInteger(s.heightPx)).toBe(true);
        expect(s.y1 - s.y0).toBeCloseTo(s.heightPx / dpr, 9);
      }
    });
  }
  it('dpr 1.5 with y 101 -> start snaps down to 100.666.. (not a half device pixel)', () => {
    expect(snapDown(101, 1.5)).toBeCloseTo(100.6666667, 5);
  });
  it('layer end is clamped to the canvas height', () => {
    const s = layerSpan(10, 5000, 800, 2);
    expect(s.y1).toBeCloseTo(800, 6);
  });
});

describe('layer span overshoot', () => {
  it('dpr 1.5 with odd canvas height -> end may pass cssH by less than 1 device pixel', () => {
    const s = layerSpan(10, 5000, 667, 1.5); // 667*1.5 = 1000.5 device px
    expect(s.y1).toBeGreaterThan(667);
    expect(s.y1 - 667).toBeLessThan(1 / 1.5);
  });
  it('dpr 1 -> end never passes cssH', () => {
    expect(layerSpan(10, 5000, 667, 1).y1).toBeCloseTo(667, 9);
  });
});

describe('scanline alpha (G)', () => {
  const c = VIEW_CONFIG.crt;
  const mean = (dpr: number): number => {
    const p = scanlineParams(dpr, c.scanPeriod, c.scanThickness, c.scanAlpha);
    return (p.thick / p.period) * p.alpha;
  };
  it('dpr 1 keeps the configured alpha', () => {
    expect(scanlineParams(1, c.scanPeriod, c.scanThickness, c.scanAlpha).alpha).toBeCloseTo(c.scanAlpha, 9);
  });
  for (const dpr of [1.5, 2, 3]) {
    it(`dpr ${dpr} -> average darkness equals dpr 1`, () => {
      expect(mean(dpr)).toBeCloseTo(mean(1), 9);
    });
  }
  it('dpr 1.5 -> alpha is lower than at dpr 1 (2/3 of the rows are covered)', () => {
    expect(scanlineParams(1.5, 2, 1, 0.08).alpha).toBeLessThan(0.08);
  });
});

describe('golden bug snapping (H)', () => {
  for (const dpr of [1, 1.5, 2]) {
    it(`dpr ${dpr}: pulsing sizes are even whole device px and positions sit on the grid`, () => {
      const out = newSnappedSquare();
      for (let t = 0; t < 200; t++) {
        const size = 90 * (1 + 0.06 * Math.sin(t * 0.1)) + 0.37;
        const q = snapSquareEven(123.37 + t * 0.013, 211.91, size, dpr, out);
        const px = q.size * dpr;
        expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-6);
        expect(Math.round(px) % 2).toBe(0);
        expect(onGrid(q.left, dpr)).toBe(true);
        expect(onGrid(q.top, dpr)).toBe(true);
      }
    });
  }
  it('center stays within half a device pixel of the requested center', () => {
    const q = snapSquareEven(50.3, 60.7, 33.3, 1.5, newSnappedSquare());
    expect(Math.abs(q.left + q.size / 2 - 50.3)).toBeLessThanOrEqual(0.5 / 1.5 + 1e-9);
    expect(Math.abs(q.top + q.size / 2 - 60.7)).toBeLessThanOrEqual(0.5 / 1.5 + 1e-9);
  });
});

describe('css and assets (I, J, K)', () => {
  const read = (rel: string, enc: 'utf8' | 'latin1' = 'utf8'): string => readFileSync(new URL(rel, import.meta.url), enc);
  const css = read('../src/ui/ui.css');
  it('brand and best HUD use --safe-l instead of the raw left inset', () => {
    expect(css).toContain('--safe-l: max(0px, calc(env(safe-area-inset-left, 0px) - var(--gutter)))');
    const brand = css.match(/\.brand \{[^}]*\}/)![0];
    const best = css.match(/\.hud-best \{[^}]*\}/)![0];
    for (const b of [brand, best]) {
      expect(b).toContain('var(--safe-l)');
      expect(b).not.toContain('safe-area-inset-left');
    }
  });
  it('life shards never move upward (they would cover the Sound button)', () => {
    const dys = [...css.matchAll(/--dy:\s*(-?[\d.]+)%/g)].map((m) => Number(m[1]));
    expect(dys.length).toBe(4);
    for (const dy of dys) expect(dy).toBeGreaterThanOrEqual(0);
  });
  it('reduced motion still disables the shard animation', () => {
    expect(css).toContain('.ui.reduced .life.break .shard');
  });
  it('original logo exists and index.html uses it as the favicon', () => {
    expect(existsSync(new URL('../src/assets/devcol-logo.png', import.meta.url))).toBe(true);
    const html = read('../index.html');
    expect(html).toMatch(/rel="icon"[^>]*href="\.\/src\/assets\/devcol-logo\.png"/);
    expect(html).toContain('class="brand-logo" src="./src/assets/devcol-logo-dark.png"');
  });
  it('bug-squash favicon is a byte-identical copy of the Stack Up logo', () => {
    const a = read('../src/assets/devcol-logo.png', 'latin1');
    const b = read('../../stack-up/src/assets/devcol-logo.png', 'latin1');
    expect(a.length).toBeGreaterThan(0);
    expect(a === b).toBe(true);
  });
});
