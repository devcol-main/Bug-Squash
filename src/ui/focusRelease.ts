interface Blurable {
  blur(): void;
}

/** 현재 포커스(active)가 targets(닉네임 입력칸, Submit 버튼) 중 하나면 blur하고 true. 아니면 아무 것도 하지 않고 false. (Space가 Submit을 다시 누르지 않게) */
export function releaseFocus(active: Blurable | null | undefined, targets: readonly unknown[]): boolean {
  if (!active || !targets.includes(active)) return false;
  active.blur();
  return true;
}
