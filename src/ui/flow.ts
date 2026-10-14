// 화면 흐름 상태 기계. DOM/시간 API 없이 dt만 받는다.
export type Phase = 'title' | 'playing' | 'gameOver';
/** tap()이 호출자에게 요구하는 동작. */
export type TapAction = 'start' | 'retry' | 'none';

export class GameFlow {
  phase: Phase = 'title';
  /** 현재 판에서 점수를 이미 제출했는가. */
  submitted = false;
  /** 판 번호. 비동기 결과(리더보드 조회)가 이전 판 것인지 구별하는 데 쓴다. */
  round = 0;
  /** 옵션 패널이 열려 있는가. 열린 동안 tap()은 아무것도 하지 않는다. */
  optionsOpen = false;
  private sinceOver = 0;

  constructor(private readonly inputLockSec: number) {}

  update(dt: number): void {
    if (this.phase === 'gameOver') this.sinceOver += dt;
  }

  /**
   * 시작/재시작 입력(화면 탭, Space). 플레이 중의 보드 탭은 PointerInput이 따로 처리하므로 여기서는 'none'.
   * 게임 오버 직후 잠금 시간 동안은 'none'.
   */
  tap(): TapAction {
    if (this.optionsOpen) return 'none';
    switch (this.phase) {
      case 'title':
        this.phase = 'playing';
        return 'start';
      case 'playing':
        return 'none';
      case 'gameOver':
        if (this.sinceOver < this.inputLockSec) return 'none';
        this.phase = 'playing';
        this.round++;
        this.submitted = false;
        return 'retry';
    }
  }

  /** DEV 훅용: 상태와 상관없이 바로 플레이 상태로 시작(잠금 무시). */
  startNow(): void {
    this.phase = 'playing';
    this.round++;
    this.submitted = false;
    this.optionsOpen = false;
  }

  /** 옵션 패널 열기. 플레이 중에는 거부(false). */
  openOptions(): boolean {
    if (this.phase === 'playing') return false;
    this.optionsOpen = true;
    return true;
  }

  closeOptions(): void {
    this.optionsOpen = false;
  }

  /** core의 gameOver 이벤트에서 호출. 플레이 중일 때만 전이한다. */
  endGame(): boolean {
    if (this.phase !== 'playing') return false;
    this.phase = 'gameOver';
    this.sinceOver = 0;
    this.submitted = false;
    return true;
  }

  /** 점수 제출 권한을 얻는다. 판당 한 번만 true. 게임 오버 상태에서만 가능. */
  claimSubmit(): boolean {
    if (this.phase !== 'gameOver' || this.submitted) return false;
    this.submitted = true;
    return true;
  }
}
