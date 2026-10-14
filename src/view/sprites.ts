// 칸/오브젝트 스프라이트 캐시. 리사이즈/DPR 변경 시에만 오프스크린에 그린다 (shadowBlur는 build 안에서만).
// 모든 스프라이트는 "칸 전체 영역" 정사각형(refSize CSS px)을 덮는다. 그릴 때 칸 크기로 스케일한다.
// 오브젝트는 pixelArt 그리드를 정수 크기 블록(fillRect)으로 그려 또렷하다.
import { cellMetricsPx, pixelBlockPx } from './objectBounds';
import { BUG_GRID, FEATURE_GRID, HARD_CRACKED_GRID, HARD_GRID, gridCols, gridRows, type PixelGrid } from './pixelArt';
import { VIEW_CONFIG } from './viewConfig';

export const SpriteId = {
  Bug: 0,
  Hard: 1,
  HardCracked: 2,
  Golden: 3,
  Feature: 4,
} as const;

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

type Ctx = CanvasRenderingContext2D;
type CreateSurface = (w: number, h: number) => HTMLCanvasElement;

const defaultCreate: CreateSurface = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export interface SpriteSet {
  cellNormal: HTMLCanvasElement;
  cellBright: HTMLCanvasElement;
  objects: HTMLCanvasElement[];
  /** 칸 스프라이트 한 변 (디바이스 px). */
  cellPx: number;
  /** 오브젝트 스프라이트 한 변 (디바이스 px, 글로우 패딩 포함). */
  surfPx: number;
  /** 골든 커서 `_` 사각형 (오브젝트 스프라이트 표면 px 좌표, 블록 그리드에 스냅). */
  cursor: { x: number; y: number; w: number; h: number };
}

export class Sprites {
  private sets: (SpriteSet | undefined)[] = [];
  private last: SpriteSet | null = null;
  private builtKey = '';

  constructor(private readonly create: CreateSurface = defaultCreate) {}

  /** 보드 칸 수(grid)에 맞는 세트. 없으면 마지막으로 만든 세트. */
  get(grid: number): SpriteSet {
    return this.sets[grid] ?? this.last!;
  }

  /** boardSize: 보드 한 변 (CSS px). grids 각각의 칸 크기에 맞춰 세트를 따로 만든다 (정수 블록이 또렷하도록). */
  build(boardSize: number, dpr: number, grids: readonly number[]): void {
    const key = `${boardSize.toFixed(2)}@${dpr}:${grids.join(',')}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.sets = [];
    for (const n of grids) {
      const set = this.buildSet(Math.max(8, Math.round((boardSize / n) * dpr)));
      this.sets[n] = set;
      this.last = set;
    }
  }

  private buildSet(px: number): SpriteSet {
    const c = VIEW_CONFIG.colors;
    const objects = [
      this.buildPixels(px, c.bug, BUG_GRID),
      this.buildPixels(px, c.hard, HARD_GRID),
      this.buildPixels(px, c.hard, HARD_CRACKED_GRID),
      this.buildPixels(px, c.golden, BUG_GRID),
      this.buildPixels(px, c.feature, FEATURE_GRID),
    ];
    const surfPx = objects[0]!.width;
    const b = pixelBlockPx(px);
    const cc = VIEW_CONFIG.goldenCursor;
    const ox = Math.round((surfPx - gridCols(BUG_GRID) * b) / 2);
    const oy = Math.round((surfPx - gridRows(BUG_GRID) * b) / 2);
    return {
      cellNormal: this.buildCell(px, false),
      cellBright: this.buildCell(px, true),
      objects,
      cellPx: px,
      surfPx,
      cursor: {
        x: ox + Math.floor((gridCols(BUG_GRID) - cc.cols) / 2) * b,
        y: oy + (gridRows(BUG_GRID) + cc.gapRows) * b,
        w: cc.cols * b,
        h: b,
      },
    };
  }

  private surface(px: number, pad = 0): [HTMLCanvasElement, Ctx] {
    const side = Math.round(px * (1 + 2 * pad));
    const s = this.create(side, side);
    return [s, s.getContext('2d') as Ctx];
  }

  /** 각진 칸: 채움 + 외곽선 + 왼쪽 위 타이틀바 장식 (점 + 얇은 막대). 글자 없음. */
  private buildCell(px: number, bright: boolean): HTMLCanvasElement {
    const c = VIEW_CONFIG;
    const [s, g] = this.surface(px);
    const { inset, lw } = cellMetricsPx(px);
    const w = px - inset * 2;
    g.fillStyle = c.cellFillColor;
    g.fillRect(inset, inset, w, w);
    const line = bright ? c.cellActiveColor : c.cellStrokeColor;
    if (bright) {
      g.shadowColor = c.cellActiveColor;
      g.shadowBlur = px * c.cellGlowBlur;
    }
    g.fillStyle = line;
    g.fillRect(inset, inset, w, lw);
    g.fillRect(inset, inset + w - lw, w, lw);
    g.fillRect(inset, inset, lw, w);
    g.fillRect(inset + w - lw, inset, lw, w);
    g.shadowBlur = 0;
    const t = c.cellTitle;
    const dot = Math.max(1, Math.round(px * t.dot));
    const gap = Math.max(1, Math.round(px * t.gap));
    const barH = Math.max(1, Math.round(px * t.barH));
    const pad = Math.round(px * t.pad);
    let x = inset + lw + pad;
    const y = inset + lw + pad;
    g.fillStyle = rgba(line, bright ? t.brightAlpha : 1);
    for (let i = 0; i < t.dots; i++) {
      g.fillRect(x, y, dot, dot);
      x += dot + gap;
    }
    g.fillRect(x, y + Math.round((dot - barH) / 2), Math.round(px * t.barW), barH);
    return s;
  }

  /** 픽셀 그리드를 칸 중앙에 정수 블록으로 그린다. 글로우는 여기서만 shadowBlur. */
  private buildPixels(px: number, hex: string, grid: PixelGrid): HTMLCanvasElement {
    const [s, g] = this.surface(px, VIEW_CONFIG.objectPad);
    const b = pixelBlockPx(px);
    const cols = gridCols(grid);
    const ox = Math.round((s.width - cols * b) / 2);
    const oy = Math.round((s.height - gridRows(grid) * b) / 2);
    g.fillStyle = hex;
    g.shadowColor = rgba(hex, VIEW_CONFIG.objectGlowAlpha);
    g.shadowBlur = px * VIEW_CONFIG.objectGlowBlur;
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]!;
      for (let col = 0; col < cols; col++) if (row[col] === '#') g.fillRect(ox + col * b, oy + r * b, b, b);
    }
    return s;
  }
}
