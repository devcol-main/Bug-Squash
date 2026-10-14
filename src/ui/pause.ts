// 일시정지 컨트롤러. 명시적 paused 플래그(clock)와 부수 동작(오디오, 입력 버리기)을 묶는다. DOM 없음.
import type { FrameClock } from './frameClock';

export interface PauseHooks {
  /** 숨김/복귀 때 쌓인 입력을 버린다. */
  clearInput(): void;
  suspendAudio(): void;
  resumeAudio(): void;
}

export class PauseController {
  constructor(private readonly clock: FrameClock, private readonly hooks: PauseHooks) {}

  get paused(): boolean {
    return this.clock.isPaused;
  }

  /** visibilitychange/pagehide/pageshow에서 호출. 같은 상태로의 전이는 무시한다. */
  set(paused: boolean): void {
    if (paused === this.clock.isPaused) return;
    if (paused) {
      this.clock.pause();
      this.hooks.clearInput();
      this.hooks.suspendAudio();
    } else {
      this.clock.resume(); // 복귀 첫 프레임은 기준 타임스탬프만 잡고 dt = 0
      this.hooks.clearInput();
      this.hooks.resumeAudio();
    }
  }
}
