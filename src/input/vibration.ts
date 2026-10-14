import { INPUT_CONFIG } from './inputConfig';

let enabled = true;

export function setVibrationEnabled(v: boolean): void { enabled = v; }
export function isVibrationEnabled(): boolean { return enabled; }

function vibrate(pattern: number | readonly number[]): void {
  if (!enabled) return;
  try {
    const nav = (globalThis as { navigator?: { vibrate?: (p: number | number[]) => boolean } }).navigator;
    if (!nav || typeof nav.vibrate !== 'function') return;
    nav.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    // 미지원/예외는 조용히 무시
  }
}

export const vibrateFeatureTap = (): void => vibrate(INPUT_CONFIG.vibration.featureTap);
export const vibrateMiss = (): void => vibrate(INPUT_CONFIG.vibration.miss);
export const vibrateGameOver = (): void => vibrate(INPUT_CONFIG.vibration.gameOver);
