// 출현/퇴장 스케일 계산 (순수 함수).
import { VIEW_CONFIG } from './viewConfig';

/**
 * 오브젝트 스케일 0..1.
 * elapsed: 출현 후 경과(초), remaining: 남은 노출 시간(초). 출현은 경과 기준, 퇴장은 노출 끝 popDuration 동안 역재생.
 */
export function popScale(elapsed: number, remaining: number, pop: number = VIEW_CONFIG.popDuration): number {
  if (pop <= 0) return 1;
  const tin = Math.min(1, Math.max(0, elapsed / pop));
  const tout = Math.min(1, Math.max(0, remaining / pop));
  return easeOut(Math.min(tin, tout));
}

function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u;
}

/** 확장 진행도 이징 (0 -> 0, 1 -> 1). */
export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 확장 진행도(core, 정지 시간 전체 기준 0..1) -> 재배치 구간(animDur초) 기준 0..1. 나머지는 4x4 유지. */
export function expandAnimT(progress: number, pause: number, animDur: number): number {
  if (animDur <= 0) return 1;
  return Math.min(1, Math.max(0, (progress * pause) / animDur));
}

export function easeOutCubic(t: number): number {
  const k = 1 - Math.min(1, Math.max(0, t));
  return 1 - k * k * k;
}
