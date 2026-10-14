import { UI_CONFIG } from './uiConfig';

/** 폰트 로드를 기다린다. 실패/타임아웃이어도 resolve (폴백 폰트로 게임은 돌아간다). */
export function waitForFont(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((r) => {
    timer = setTimeout(r, UI_CONFIG.fontTimeoutMs);
  });
  const load = fonts.load(UI_CONFIG.fontSpec).then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([load, timeout]).finally(() => clearTimeout(timer));
}
