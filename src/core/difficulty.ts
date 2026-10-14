import type { BugSquashConfig } from './config';

// 플레이 시간 t(초, 일시정지 제외) -> 난이도 값. 모두 상한/하한 적용.

export function spawnInterval(t: number, cfg: BugSquashConfig): number {
  return Math.max(cfg.spawnIntervalMin, cfg.spawnIntervalStart * Math.pow(cfg.spawnIntervalDecay, t));
}

/** 일반 버그/기능 기준 노출 시간. 종류별 배율은 호출 쪽에서 곱한다. */
export function exposureTime(t: number, cfg: BugSquashConfig): number {
  return Math.max(cfg.exposureMin, cfg.exposureStart - cfg.exposureDecayPerSec * t);
}

export function featureRatio(t: number, cfg: BugSquashConfig): number {
  return Math.min(cfg.featureRatioMax, cfg.featureRatioStart + cfg.featureRatioPerSec * t);
}

export function maxConcurrent(boardSize: number, t: number, cfg: BugSquashConfig): number {
  if (boardSize >= cfg.largeBoardSize) {
    return t >= cfg.maxConcurrentLargeLateAt ? cfg.maxConcurrentLargeLate : cfg.maxConcurrentLarge;
  }
  return t >= cfg.maxConcurrentSmallLateAt ? cfg.maxConcurrentSmallLate : cfg.maxConcurrentSmall;
}
