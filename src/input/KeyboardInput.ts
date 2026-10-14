import { keyToCell } from './keyToCell';

export interface KeyContext {
  phase: string;
  optionsOpen: boolean;
  /** 닉네임 입력칸 등 글자를 치는 요소에 포커스가 있는가 */
  textTarget: boolean;
  /** 버튼(또는 버튼 안쪽)에 포커스가 있는가 */
  buttonTarget: boolean;
}

/**
 * 칸 키를 받아들일 상태인가. 플레이 중이고 옵션 패널이 닫혀 있고,
 * 입력칸이나 버튼에 포커스가 없을 때만. (기존 Space 처리와 같은 기준)
 */
export function shouldAcceptCellKey(s: KeyContext): boolean {
  return s.phase === 'playing' && !s.optionsOpen && !s.textTarget && !s.buttonTarget;
}

export interface CellSink {
  push(cell: number): boolean;
}

/**
 * window keydown -> 칸 큐. 한 번의 keydown 이 탭 한 번.
 * 칸은 event.code 로 정해지므로 한글 입력기 상태(key 가 'ㅂ')에서도 KeyQ 는 같은 칸이다.
 */
export class KeyboardInput {
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    private readonly target: EventTarget,
    sink: CellSink,
    getGridSize: () => number,
    canAccept: (e: KeyboardEvent) => boolean,
  ) {
    this.onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const cell = keyToCell(e.code, getGridSize());
      if (cell < 0) return;
      if (!canAccept(e)) return;
      e.preventDefault(); // 플레이 중 브라우저 기본 동작(Quick Find 등) 방지
      sink.push(cell);
    };
    target.addEventListener('keydown', this.onKeyDown as EventListener);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
  }
}
