// VFX 곡선 순수 함수 (DOM/Canvas 없음): 글리치 오프셋, 타이핑, CRT 꺼짐.
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;

/**
 * 글리치 띠 하나의 x 오프셋. unit(-1..1, 이벤트 시점 rng)이 방향과 크기를 정하고, 시간에 따라 선형으로 줄며
 * 일정 속도로 부호가 뒤집힌다. 지속 시간이 지나거나 enabled=false(reduced motion)이면 정확히 0.
 */
export function glitchOffset(unit: number, elapsed: number, duration: number, amp: number, enabled: boolean): number {
  if (!enabled || duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  const flip = Math.floor(elapsed * FX.glitchFlipRate) % 2 === 0 ? 1 : -1;
  return unit * amp * (1 - elapsed / duration) * flip;
}

/** 타이핑으로 보이는 글자 수 (0..total). typing=false(reduced motion)이면 처음부터 전체. */
export function typedChars(elapsed: number, total: number, typeDuration: number, typing: boolean): number {
  if (!typing) return total;
  if (elapsed <= 0) return 0;
  if (elapsed >= typeDuration) return total;
  return Math.min(total, Math.floor((elapsed / typeDuration) * (total + 1)));
}

export interface CrtOffState {
  /** 세로 배율 (1 -> 0). */
  scaleY: number;
  /** 가로 배율 (1 -> 0). 수축 구간에서는 1. */
  scaleX: number;
  /** 밝은 반전 정도 (0..1). 수축하며 밝아진다. */
  glow: number;
}

/**
 * CRT 꺼짐 곡선. 앞 squashPortion 동안 세로가 가로선(lineScale)까지 줄고(점점 밝아짐),
 * 나머지 동안 가로선이 점으로 줄며 사라진다. elapsed 0 -> scaleY 1, duration 이후 -> 0.
 */
export function crtOffCurve(elapsed: number, duration: number, out: CrtOffState): CrtOffState {
  const sp = FX.crtOffSquashPortion;
  const k = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  if (k < sp) {
    const q = k / sp;
    out.scaleY = 1 - (1 - FX.crtOffLineScale) * q * q;
    out.scaleX = 1;
    out.glow = q;
  } else {
    const q = (k - sp) / (1 - sp);
    out.scaleY = FX.crtOffLineScale * (1 - q);
    out.scaleX = 1 - q * q;
    out.glow = 1;
  }
  return out;
}

/** Reduced motion 게임 오버 페이드: 레이어 알파 1 -> 0. */
export function endFadeAlpha(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - elapsed / duration));
}
