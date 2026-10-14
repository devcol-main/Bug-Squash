// devicePixelRatio 변화 감지 (창을 다른 DPR의 모니터로 옮길 때 resize 이벤트가 오지 않는 경우 대비).
// matchMedia('(resolution: Ndppx)')는 현재 DPR에서 벗어날 때 change를 한 번 낸다. 매번 새 DPR로 다시 등록한다.
import { onMediaChange, type MediaQueryListLike } from './mediaQuery';

export type MediaQueryLike = MediaQueryListLike;

/** 해제 함수를 돌려준다. matchMedia를 못 쓰면 아무 것도 하지 않는다. */
export function watchDpr(
  matchMedia: ((q: string) => MediaQueryLike) | null,
  getDpr: () => number,
  onChange: () => void,
): () => void {
  if (!matchMedia) return () => {};
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  const handler = (): void => {
    if (disposed) return;
    onChange();
    register();
  };
  const register = (): void => {
    unsubscribe?.();
    unsubscribe = onMediaChange(matchMedia(`(resolution: ${getDpr()}dppx)`), handler);
  };
  register();
  return () => {
    disposed = true;
    unsubscribe?.();
  };
}
