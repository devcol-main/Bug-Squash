import { INPUT_CONFIG } from './inputConfig';
import { InputQueue } from './InputQueue';
import { pointToCell, type BoardRect } from './pointToCell';

/** 캔버스 pointerdown -> 칸 인덱스 큐. core 는 게임 루프가 drain 하면서 호출한다. */
export class PointerInput {
  private readonly queue = new InputQueue(INPUT_CONFIG.queueCapacity);
  private board: BoardRect = { x: 0, y: 0, size: 0 };
  private gridSize = 3;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const prevent = (e: Event): void => e.preventDefault();
    const onDown = (e: PointerEvent): void => {
      // 마우스는 주 버튼만. 터치/펜은 button 0.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // preventDefault 는 user activation 에 영향 없음. 단 touch 의 pointerdown 은 user activation 을
      // 일으키지 않으므로, 오디오 언락은 pointerup/touchend 에서도 시도해야 한다 (7번 참고).
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.queue.push(pointToCell(e.clientX, e.clientY, rect, this.board, this.gridSize));
    };
    this.listen(canvas, 'pointerdown', onDown as EventListener);
    this.listen(canvas, 'contextmenu', prevent);
    this.listen(canvas, 'dblclick', prevent);
    this.listen(document, 'gesturestart', prevent); // iOS Safari
  }

  /** 보드 사각형(캔버스 CSS 좌표)과 한 변 칸 수를 갱신. 리사이즈/보드 확장 때 호출. */
  setBoard(board: BoardRect, gridSize: number): void {
    this.board.x = board.x;
    this.board.y = board.y;
    this.board.size = board.size;
    this.gridSize = gridSize;
  }

  /** 다른 입력원(키보드)이 같은 큐에 칸을 넣는다. 비활성이면 false. */
  pushCell(cell: number): boolean { return this.queue.push(cell); }

  /** 쌓인 입력을 모두 버린다 (일시정지/복귀 때). */
  clear(): void { this.queue.clear(); }

  setEnabled(v: boolean): void { this.queue.setEnabled(v); }
  get enabled(): boolean { return this.queue.enabled; }

  /** 프레임마다 호출. 쌓인 칸 인덱스를 순서대로 cb 에 넘긴다. */
  drain(cb: (cell: number) => void): void { this.queue.drain(cb); }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.queue.clear();
  }

  private listen(t: EventTarget, type: string, fn: EventListener): void {
    t.addEventListener(type, fn, { passive: false });
    this.cleanups.push(() => t.removeEventListener(type, fn));
  }
}
