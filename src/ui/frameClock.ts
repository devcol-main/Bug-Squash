// 프레임 dt 계산기. DOM 없이 타임스탬프와 일시정지 상태만 다룬다.
// - 일시정지 중에는 dt = 0 (시간 누적 없음)
// - 복귀 후 첫 프레임은 기준 타임스탬프를 새로 잡으므로 dt = 0 (순간이동 방지)
// - NaN / 음수 / Infinity 는 0, 상한은 maxDt 로 clamp
export class FrameClock {
  private last: number | null = null;
  private paused = false;

  constructor(private readonly maxDt: number) {}

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
    this.last = null;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = null; // 복귀 첫 프레임에서 기준만 잡는다
  }

  /** rAF 타임스탬프(ms)를 받아 이번 프레임의 dt(초)를 돌려준다. */
  tick(nowMs: number): number {
    if (this.paused || !Number.isFinite(nowMs)) return 0;
    const prev = this.last;
    this.last = nowMs;
    if (prev === null) return 0;
    const dt = (nowMs - prev) / 1000;
    if (!(dt > 0)) return 0; // NaN, 0, 음수
    return dt > this.maxDt ? this.maxDt : dt;
  }
}
