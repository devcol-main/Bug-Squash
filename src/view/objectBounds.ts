// 오브젝트 본체 범위 / 그려진 칸 안쪽 반폭 (순수 함수). 스프라이트와 같은 픽셀 그리드, viewConfig 값을 쓴다.
import { BUG_GRID, FEATURE_GRID, HARD_GRID, gridCols, gridRows, type PixelGrid } from './pixelArt';
import { VIEW_CONFIG } from './viewConfig';

export type BoundsKind = 'bug' | 'hard' | 'golden' | 'feature';

export interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 칸 전체 박스 한 변을 1로 볼 때, 그려진 칸 외곽선 안쪽 가장자리까지의 반폭. */
export function drawnCellInnerHalf(): number {
  return 0.5 - VIEW_CONFIG.cellInset - VIEW_CONFIG.cellStroke;
}

export function gridOf(kind: BoundsKind): PixelGrid {
  return kind === 'hard' ? HARD_GRID : kind === 'feature' ? FEATURE_GRID : BUG_GRID;
}

/** 칸 중심에서 본체(글로우 제외) 각 방향 끝까지의 거리 / 그려진 칸 안쪽 반폭. 그리드는 칸 중앙에 놓인다. */
export function objectBoundsRatio(kind: BoundsKind, out: Bounds): Bounds {
  const g = gridOf(kind);
  const block = VIEW_CONFIG.pixelBlock;
  const inner = drawnCellInnerHalf();
  out.top = out.bottom = (gridRows(g) * block) / 2 / inner;
  out.left = out.right = (gridCols(g) * block) / 2 / inner;
  return out;
}

/** 스프라이트가 실제로 그리는 정수 블록 크기 (디바이스 px). 내림이라 공칭 크기를 넘지 않는다. sprites 와 같은 함수를 쓴다. */
export function pixelBlockPx(px: number): number {
  return Math.max(1, Math.floor(px * VIEW_CONFIG.pixelBlock));
}

/** 칸 스프라이트(한 변 px)의 정수 inset / 외곽선 두께 (디바이스 px). */
export function cellMetricsPx(px: number): { inset: number; lw: number } {
  return { inset: Math.round(px * VIEW_CONFIG.cellInset), lw: Math.max(1, Math.round(px * VIEW_CONFIG.cellStroke)) };
}

/** 실제로 그리는 블록과 칸 외곽선 기준의 범위 비율 (칸 스프라이트 한 변이 px 디바이스 px일 때). */
export function objectBoundsRatioPx(kind: BoundsKind, px: number, out: Bounds): Bounds {
  const g = gridOf(kind);
  const b = pixelBlockPx(px);
  const m = cellMetricsPx(px);
  const inner = px / 2 - m.inset - m.lw;
  out.top = out.bottom = (gridRows(g) * b) / 2 / inner;
  out.left = out.right = (gridCols(g) * b) / 2 / inner;
  return out;
}
