export interface RectLike { left: number; top: number; width: number; height: number }
export interface BoardRect { x: number; y: number; size: number }

/**
 * 포인터 좌표(CSS px, clientX/Y) -> 칸 인덱스(행 우선). 보드 밖이면 -1.
 * canvasRect 는 getBoundingClientRect() 결과(CSS px)이고, board 는 캔버스 CSS 좌표계 사각형이다.
 * 캔버스 백킹 크기(width*dpr)는 쓰지 않으므로 DPR 과 무관하다.
 * 왼쪽/위 경계는 포함, 오른쪽/아래 경계(x+size)는 제외.
 */
export function pointToCell(
  clientX: number,
  clientY: number,
  canvasRect: RectLike,
  board: BoardRect,
  gridSize: number,
): number {
  const lx = clientX - canvasRect.left - board.x;
  const ly = clientY - canvasRect.top - board.y;
  if (!(board.size > 0) || gridSize < 1) return -1;
  if (!(lx >= 0 && ly >= 0 && lx < board.size && ly < board.size)) return -1;
  const cell = board.size / gridSize;
  const col = Math.min(gridSize - 1, Math.floor(lx / cell));
  const row = Math.min(gridSize - 1, Math.floor(ly / cell));
  return row * gridSize + col;
}
