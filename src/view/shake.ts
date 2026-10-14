// 화면 흔들림 순수 함수.
/** 경과 시간 -> 진폭. elapsed 0에서 amp, duration 이후 0 (제곱 감쇠). */
export function shakeAmplitude(elapsed: number, duration: number, amp: number): number {
  if (duration <= 0 || elapsed >= duration) return 0;
  const k = 1 - Math.max(0, elapsed) / duration;
  return amp * k * k;
}

export interface Offset2 {
  x: number;
  y: number;
}

/** 감쇠 진동 오프셋. out 에 기록한다. */
export function shakeOffset(
  elapsed: number, duration: number, amp: number, freqX: number, freqY: number, out: Offset2,
): Offset2 {
  const a = shakeAmplitude(elapsed, duration, amp);
  out.x = a * Math.sin(elapsed * freqX);
  out.y = a * Math.cos(elapsed * freqY);
  return out;
}
