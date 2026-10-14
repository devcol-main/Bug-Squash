// 보드/칸 레이아웃 순수 함수 (CSS px). DOM 참조 없음.
import type { BoardRect } from '../input/pointToCell';
import { VIEW_CONFIG } from './viewConfig';

export type { BoardRect };

export interface CellBox {
  /** 칸 중심 (CSS px). */
  cx: number;
  cy: number;
  /** 칸 전체 한 변 (입력 판정 영역 크기). */
  size: number;
  /** 0..1. 확장 중 새로 생기는 칸이 서서히 나타나는 용도. */
  alpha: number;
}

export function newCellBox(): CellBox {
  return { cx: 0, cy: 0, size: 0, alpha: 1 };
}

/** 위쪽 HUD 영역 높이 (보드가 이 아래에서 시작한다). */
export function hudHeight(cssH: number): number {
  const c = VIEW_CONFIG;
  return Math.min(c.hudHeightMax, Math.max(c.hudHeightMin, cssH * c.hudHeightRatio));
}

/** 남는 세로 공간에서 보드를 놓는 비율 (0 = HUD 쪽). 세로가 긴 화면일수록 HUD에 가깝게. */
export function slackBias(cssW: number, cssH: number): number {
  const c = VIEW_CONFIG;
  if (!(cssW > 0)) return c.slackBias;
  const t = Math.min(1, Math.max(0, (cssH / cssW - c.tallAspectStart) / (c.tallAspectEnd - c.tallAspectStart)));
  return c.slackBias + (c.slackBiasTall - c.slackBias) * t;
}

/**
 * HUD 오버레이(ui.css)의 내용이 실제로 차지하는 아래 끝 y (CSS px, safe-area 제외). 띠(hudHeight) 안에 들어가야 한다.
 * ui.css 값과 맞춰 둔 미러: u = min(폭, 높이*9/16)/100. 라이프(정사각형 블록) = 3u + 52px + max(16px, 4.4u), 배율 = 16.4u + 4.4u*1.1.
 */
export function hudContentBottom(cssW: number, cssH: number): number {
  const u = Math.min(cssW, cssH * (9 / 16)) / 100;
  const lives = 3 * u + 52 + Math.max(16, 4.4 * u);
  const combo = 16.4 * u + 4.4 * u * 1.1;
  return Math.max(lives, combo);
}

/** 뷰포트 CSS 크기 -> 보드 정사각형. 가로 가운데, 세로는 HUD 아래 ~ 아래 여백 사이에서 slackBias 위치. */
export function computeBoardRect(cssW: number, cssH: number): BoardRect {
  const c = VIEW_CONFIG;
  const top = hudHeight(cssH);
  const availH = Math.max(0, cssH - top - cssH * c.bottomMarginRatio);
  const availW = Math.max(0, cssW * (1 - 2 * c.sideMarginRatio));
  const size = Math.min(availW, availH);
  return { x: (cssW - size) / 2, y: top + (availH - size) * slackBias(cssW, cssH), size };
}

/** gridSize 균등 분할의 칸 index 전체 영역. out에 기록해 할당을 피한다. */
export function cellBox(board: BoardRect, gridSize: number, index: number, out: CellBox): CellBox {
  const s = board.size / gridSize;
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  out.size = s;
  out.cx = board.x + (col + 0.5) * s;
  out.cy = board.y + (row + 0.5) * s;
  out.alpha = 1;
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 보드 확장 보간. 4x4 칸 index가 progress(0..1)에 따라 이전 3x3 위치에서 4x4 위치로 이동한다.
 * 3x3에 없던 칸(마지막 행/열)은 인접한 3x3 칸 위치에서 밀려 나오며 alpha가 0 -> 1.
 */
export function expandCellBox(
  board: BoardRect, fromGrid: number, toGrid: number, index: number, progress: number, out: CellBox,
): CellBox {
  const p = Math.min(1, Math.max(0, progress));
  const row = Math.floor(index / toGrid);
  const col = index % toGrid;
  const fr = Math.min(row, fromGrid - 1);
  const fc = Math.min(col, fromGrid - 1);
  const fs = board.size / fromGrid;
  const ts = board.size / toGrid;
  const fcx = board.x + (fc + 0.5) * fs;
  const fcy = board.y + (fr + 0.5) * fs;
  const tcx = board.x + (col + 0.5) * ts;
  const tcy = board.y + (row + 0.5) * ts;
  out.cx = lerp(fcx, tcx, p);
  out.cy = lerp(fcy, tcy, p);
  out.size = lerp(fs, ts, p);
  out.alpha = row >= fromGrid || col >= fromGrid ? p : 1;
  return out;
}
