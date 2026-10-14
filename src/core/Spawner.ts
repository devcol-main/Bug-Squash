import type { BugSquashConfig } from './config';
import { featureRatio, spawnInterval } from './difficulty';
import type { Rng } from './rng';

export type ObjectKind = 'bug' | 'hard' | 'golden' | 'feature';

/** 출현 타이밍, 종류 선택, 칸 선택. 난수는 주입된 rng만 쓴다. */
export class Spawner {
  /** 다음 출현까지 남은 시간(초). */
  timer: number;

  constructor(
    private readonly rng: Rng,
    private readonly cfg: BugSquashConfig,
  ) {
    this.timer = cfg.firstSpawnDelay;
  }

  /** 출현 간격 타이머를 현재 난이도 기준으로 다시 맞춘다. */
  schedule(t: number): void {
    this.timer = spawnInterval(t, this.cfg);
  }

  /** 시각 t 의 출현 간격. */
  interval(t: number): number {
    return spawnInterval(t, this.cfg);
  }

  pickKind(t: number, goldenActive: boolean): ObjectKind {
    const c = this.cfg;
    if (t >= c.goldenFrom && !goldenActive && this.rng() < c.goldenChance) return 'golden';
    if (this.rng() < featureRatio(t, c)) return 'feature';
    if (t >= c.hardFrom && this.rng() < c.hardRatio) return 'hard';
    return 'bug';
  }

  /** free[0..count) 중 하나를 고른다. count > 0 이어야 한다. */
  pickCell(free: ArrayLike<number>, count: number): number {
    const i = Math.min(count - 1, Math.floor(this.rng() * count));
    return free[i] as number;
  }
}
