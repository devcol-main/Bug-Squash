// HUD 순수 로직. DOM 없이 테스트 가능.

/** 배율 표시 문구. */
export function multiplierText(multiplier: number): string {
  return `x${multiplier}`;
}

/** x1은 보너스가 없으므로 숨긴다(자리는 유지해 레이아웃이 움직이지 않게). */
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

/** 배율이 오르고 표시 대상(x2 이상)일 때만 반전 깜박임을 재생한다. 내려가거나 x1로 리셋될 때는 재생하지 않는다. */
export function shouldBlinkMultiplier(prev: number, next: number): boolean {
  return next > prev && multiplierVisible(next);
}

/** 터미널 체크박스 표기: 켜짐 `[x] On`, 꺼짐 `[ ] Off`. */
export function checkboxText(on: boolean): string {
  return on ? '[x] On' : '[ ] Off';
}

/** Sound 버튼 문구(대괄호 터미널 버튼). */
export function muteButtonText(muted: boolean): string {
  return muted ? '[Sound: off]' : '[Sound: on]';
}

// Sound 버튼과 플레이 중 BUG SQUASH 문구 사이 간격 계산(단위 u = 열 폭의 1%). ui.css 값과 맞춰 둔 미러:
// .mute(font-size 3.4u, padding 0 3u, right 3u, border 1px 양쪽) 와 .logo(font-size 3.4u, letter-spacing 0.04em). 바꾸면 여기도 수정.
// 고정폭 글자 폭 0.6em을 가정한다. 오른쪽 safe-area는 ui.css의 --safe-r 가 열 바깥 여백을 뺀 나머지만 버튼에 더한다.
// borderPx는 px 값이라 u로 바꾸려면 u의 CSS px(uPx)가 필요해 호출자가 넘긴다. u = min(1vw, 0.5625vh)이므로 좁은 폭(320px: 3.2)뿐 아니라
// 낮은 가로 화면(높이 360px: 약 2.03)에서도 작아진다. 간격은 u가 작을수록 줄어든다(테두리 2px가 상대적으로 커짐).
export const MUTE_LAYOUT = { fontU: 3.4, padU: 3, rightU: 3, borderPx: 2, charEm: 0.6, logoChars: 10, logoFontU: 3.4, logoLetterSpacingEm: 0.04, minGapU: 4 } as const;

/**
 * 열 가운데 문구의 오른쪽 끝과 Sound 버튼 왼쪽 끝 사이 간격(u). 음수면 겹친다.
 * uPx는 u 하나의 CSS px(버튼 테두리 px를 u로 환산), safeRightU는 버튼에 더해지는 오른쪽 inset.
 */
export function muteLogoGapU(label: string, uPx: number, safeRightU = 0): number {
  const c = MUTE_LAYOUT;
  const buttonW = label.length * c.charEm * c.fontU + 2 * c.padU + c.borderPx / uPx;
  const buttonLeft = 50 - c.rightU - safeRightU - buttonW; // 열 가운데 기준 오른쪽으로의 거리
  const logoHalf = (c.logoChars * (c.charEm + c.logoLetterSpacingEm) * c.logoFontU) / 2;
  return buttonLeft - logoHalf;
}
