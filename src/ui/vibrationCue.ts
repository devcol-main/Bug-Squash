// 이벤트 -> 진동 종류 (순수 함수). main.ts 의 dispatch 가 이 결과로 진동을 고른다.
import type { BugSquashEvent } from '../core/BugSquashLogic';

export type VibrationKind = 'featureTap' | 'miss' | 'gameOver';

/** 진동이 없으면 null. emptyTap 은 놓침과 같은 진동, 골든 놓침은 진동 없음. */
export function vibrationForEvent(ev: BugSquashEvent): VibrationKind | null {
  switch (ev.type) {
    case 'featureTapped': return 'featureTap';
    case 'emptyTap': return 'miss';
    case 'missed': return ev.kind === 'golden' ? null : 'miss';
    case 'gameOver': return 'gameOver';
    default: return null;
  }
}
