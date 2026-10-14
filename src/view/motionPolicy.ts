// Reduced motion 정책 순수 함수 (DOM 없음). 값은 viewConfig fx.reduced.
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;
const R = FX.reduced;

export interface MotionPolicy {
  /** 화면/칸 흔들림 진폭 배율 (0 = 흔들림 없음). */
  shakeScale: number;
  /** 잡기 입자 개수와 크기 배율. */
  particleScale: number;
  /** 골든 반짝임 빈도 배율. */
  sparkleScale: number;
  /** true면 보드 확장을 칸 이동 대신 페이드로. */
  fadeExpand: boolean;
  /** 보드 확장 재배치(또는 페이드) 시간(초). */
  expandDuration: number;
  /** false면 SCALING UP 배너는 확대 없이 페이드만. */
  bannerScaleAnim: boolean;
  /** false면 CRT 밝기 깜박임을 끈다. */
  crtFlicker: boolean;
}

const FULL: MotionPolicy = {
  shakeScale: 1, particleScale: 1, sparkleScale: 1, fadeExpand: false,
  expandDuration: VIEW_CONFIG.expandAnimDuration, bannerScaleAnim: true, crtFlicker: true,
};
const REDUCED: MotionPolicy = {
  shakeScale: R.shakeScale, particleScale: R.particleScale, sparkleScale: R.sparkleScale,
  fadeExpand: R.fadeExpand, expandDuration: R.expandFadeDuration, bannerScaleAnim: R.bannerScaleAnim,
  crtFlicker: R.crtFlicker,
};

/** 축소 모드 여부 -> 정책. 같은 객체를 돌려주므로 매 프레임 불러도 할당이 없다. 수정하지 말 것. */
export function motionPolicy(reduced: boolean): Readonly<MotionPolicy> {
  return reduced ? REDUCED : FULL;
}

/** 확장 페이드 알파: t(0..1)에서 3x3 칸은 사라지고(1->0) 4x4 칸은 나타난다(0->1). */
export function expandFadeAlphas(t: number, out: { old: number; next: number }): { old: number; next: number } {
  const k = Math.min(1, Math.max(0, t));
  out.old = 1 - k;
  out.next = k;
  return out;
}

/** 배너 배율: 정책이 확대 애니메이션을 끄면 항상 1. scaleAnimated는 평소 계산값. */
export function bannerScale(policy: Readonly<MotionPolicy>, scaleAnimated: number): number {
  return policy.bannerScaleAnim ? scaleAnimated : 1;
}

/** CRT 밝기 깜박임 값: [-flickerAmp, +flickerAmp]. 정책이 끄면 항상 0. 서로 다른 두 속도의 사인을 섞어 불규칙하게 보이게 한다. */
export function crtFlickerValue(policy: Readonly<MotionPolicy>, time: number): number {
  if (!policy.crtFlicker) return 0;
  const c = VIEW_CONFIG.crt;
  return c.flickerAmp * (0.6 * Math.sin(time * c.flickerSpeedA) + 0.4 * Math.sin(time * c.flickerSpeedB));
}
