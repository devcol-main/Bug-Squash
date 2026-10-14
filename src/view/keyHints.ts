// 칸 키 힌트 글자 스프라이트 캐시. build(리사이즈/DPR 변경) 때 격자별로 칸 수만큼 미리 그리고,
// 프레임에서는 get 조회 + drawImage 만 한다. 글자 크기는 칸 크기에 비례하되 최소 minFont CSS px.
import { cellToKeyLabel } from '../input/keyToCell';
import { FONT_FAMILY } from './fxText';
import { cellMetricsPx, cellSpritePx, cellTitleMetricsPx } from './objectBounds';
import { VIEW_CONFIG } from './viewConfig';

export interface KeyHintSprite {
  canvas: HTMLCanvasElement;
  /** 칸 왼쪽 위 기준 위치와 크기 (CSS px, build 시점 칸 크기 기준). */
  x: number;
  y: number;
  w: number;
  h: number;
}

type CreateSurface = (w: number, h: number) => HTMLCanvasElement;
const defaultCreate: CreateSurface = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 격자 grid 의 칸 키 라벨 목록 (칸 index 순서). */
export function keyHintLabels(grid: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < grid * grid; i++) out.push(cellToKeyLabel(i, grid));
  return out;
}

/** 칸 한 변(CSS px)에 맞는 글자 크기 (CSS px). */
export function keyHintFontPx(cellCss: number): number {
  return Math.max(VIEW_CONFIG.keyHint.minFont, cellCss * VIEW_CONFIG.keyHint.font);
}

/** 힌트를 그릴지: 켜져 있고 스프라이트가 있을 때만. */
export function shouldDrawKeyHint(on: boolean, sprite: KeyHintSprite | undefined): sprite is KeyHintSprite {
  return on && sprite !== undefined;
}

export class KeyHintCache {
  private readonly sets: (KeyHintSprite[] | undefined)[] = [];
  private readonly cells: number[] = [];
  private params: { boardSize: number; dpr: number; grids: readonly number[] } | null = null;
  private measureCtx: CanvasRenderingContext2D | null = null;

  constructor(private readonly create: CreateSurface = defaultCreate) {}

  build(boardSize: number, dpr: number, grids: readonly number[]): void {
    this.params = { boardSize, dpr, grids };
    this.sets.length = 0;
    this.measureCtx = null;
    for (const n of grids) {
      const cellCss = boardSize / n;
      this.cells[n] = cellCss;
      this.sets[n] = keyHintLabels(n).map((label) => this.draw(label, cellCss, dpr));
    }
  }

  /** 폰트 로드 후 호출: 저장된 값으로 즉시 다시 만든다. build 전이면 아무것도 하지 않는다. */
  invalidate(): void {
    if (this.params) this.build(this.params.boardSize, this.params.dpr, this.params.grids);
  }

  /** build 시점의 칸 한 변 (CSS px). 그릴 때 현재 칸 크기와 비교해 스케일한다. */
  cellCss(grid: number): number { return this.cells[grid] || 1; }

  get(grid: number, cell: number): KeyHintSprite | undefined { return this.sets[grid]?.[cell]; }

  private draw(label: string, cellCss: number, dpr: number): KeyHintSprite {
    const K = VIEW_CONFIG.keyHint;
    const fontPx = keyHintFontPx(cellCss);
    const font = `bold ${fontPx}px ${FONT_FAMILY}`;
    const measure = (this.measureCtx ??= this.create(1, 1).getContext('2d') as CanvasRenderingContext2D);
    measure.font = font;
    const w = Math.ceil(measure.measureText(label).width) + K.widthPad;
    const h = Math.ceil(fontPx * K.lineHeight);
    const surf = this.create(Math.ceil(w * dpr), Math.ceil(h * dpr));
    const g = surf.getContext('2d') as CanvasRenderingContext2D;
    g.scale(dpr, dpr);
    g.font = font;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = K.color;
    g.fillText(label, 0, 0);
    // x: 칸 스프라이트(sprites.ts)가 실제로 그리는 막대 끝 + 최소 간격. y: 글자 중심을 점 줄 중심에 맞추되 외곽선 아래로 내려온다.
    const px = cellSpritePx(cellCss, dpr);
    const m = cellTitleMetricsPx(px);
    const x = (cellCss * m.barEnd) / px + Math.max(cellCss * K.gapMin, K.gapMinPx / dpr);
    const rowCenter = (cellCss * (m.startY + m.dot / 2)) / px;
    const { inset, lw } = cellMetricsPx(px);
    const outline = (cellCss * (inset + lw)) / px; // 실제로 그려지는(반올림된) 외곽선 안쪽 끝
    const y = Math.max(rowCenter - fontPx * K.centerEm, outline + K.topGapPx / dpr);
    return { canvas: surf, x, y, w, h };
  }
}
