// HUD 순수 로직. DOM 없이 테스트 가능.

/** 배율 표시 문구. */
export function multiplierText(multiplier: number): string {
  return `×${multiplier}`;
}

/** ×1은 보너스가 없으므로 숨긴다(자리는 유지해 레이아웃이 움직이지 않게). */
export function multiplierVisible(multiplier: number): boolean {
  return multiplier >= 2;
}

export type LifeSlotState = 'full' | 'empty';

/** 라이프 칸(0부터)의 상태: lives보다 작은 index는 채워짐, 나머지는 외곽선만. */
export function lifeSlotState(index: number, lives: number): LifeSlotState {
  return index < lives ? 'full' : 'empty';
}

export type LifeSlotChange = 'break' | 'restore' | 'none';

/** 라이프가 prev에서 next로 바뀔 때 칸 하나의 전이: 채움->빈 칸은 깨짐, 빈 칸->채움은 회복. */
export function lifeSlotChange(index: number, prev: number, next: number): LifeSlotChange {
  const a = lifeSlotState(index, prev);
  const b = lifeSlotState(index, next);
  if (a === b) return 'none';
  return b === 'empty' ? 'break' : 'restore';
}
