// 게임 오버 오버레이를 CRT 꺼짐이 끝난 뒤로 미루는 지연 타이머. DOM 없이 테스트 가능.
// 만료 시점에 같은 판(round)이고 게임 오버 상태일 때만 콜백을 부른다. 새 게임이 시작되면 cancel()로 버린다.

export class OverlayDelay<T> {
  private pending: { remaining: number; round: number; data: T } | null = null;

  /** 대기 중인 지연이 있는가. */
  get active(): boolean {
    return this.pending !== null;
  }

  /** delay초 뒤에 round 판의 오버레이를 띄우도록 예약한다. 이미 예약이 있으면 덮어쓴다. */
  start(delay: number, round: number, data: T): void {
    this.pending = { remaining: delay, round, data };
  }

  /** 예약을 버린다 (새 게임 시작). */
  cancel(): void {
    this.pending = null;
  }

  /**
   * dt초 진행한다. 만료되면 예약을 비우고, currentRound가 예약한 round와 같고 isGameOver일 때만 onFire(data)를 한 번 부른다.
   * dt = 0(일시정지 복귀 첫 프레임 등)이면 시간이 흐르지 않는다.
   */
  update(dt: number, currentRound: number, isGameOver: boolean, onFire: (data: T) => void): void {
    const p = this.pending;
    if (!p) return;
    p.remaining -= dt;
    if (p.remaining > 0) return;
    this.pending = null;
    if (p.round === currentRound && isGameOver) onFire(p.data);
  }
}
