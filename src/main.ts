import { BugSquashLogic } from './core/BugSquashLogic';
import type { BugSquashConfig } from './core/config';
import { createRng } from './core/rng';
import { BugSquashRenderer } from './view/BugSquashRenderer';

declare global {
  interface Window {
    /** 개발 모드 전용 (브라우저 확인용). 프로덕션 번들에는 없다. */
    __bugSquash?: {
      logic(): BugSquashLogic;
      restart(seed?: number, overrides?: Partial<BugSquashConfig>): BugSquashLogic;
      /** logic.tap(cell) 후 연출까지 재생한다. */
      tap(cell: number): void;
    };
  }
}

const MAX_DT = 0.1;
// TEMP: 7번에서 UI 흐름으로 교체 (게임 오버 1초 후 새 시드로 자동 재시작)
const TEMP_RESTART_DELAY = 1;

const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) {
  const renderer = new BugSquashRenderer(canvas);
  window.addEventListener('resize', () => renderer.resize());

  let overTime = 0;
  const newLogic = (seed?: number, overrides?: Partial<BugSquashConfig>): BugSquashLogic =>
    new BugSquashLogic(createRng(seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)), overrides);
  let logic = newLogic();
  if (import.meta.env.DEV) {
    window.__bugSquash = {
      logic: () => logic,
      restart: (seed, overrides) => {
        overTime = 0;
        logic = newLogic(seed, overrides);
        renderer.resetFx(logic);
        return logic;
      },
      tap: (cell) => renderer.consume(logic.tap(cell), logic),
    };
  }
  let last = performance.now();

  const frame = (now: number): void => {
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    renderer.advanceFx(dt);
    renderer.consume(logic.update(dt), logic);
    renderer.render(logic, dt);
    // TEMP: 7번에서 UI 흐름으로 교체
    if (logic.isGameOver) {
      overTime += dt;
      if (overTime >= TEMP_RESTART_DELAY) {
        logic = newLogic();
        renderer.resetFx(logic);
        overTime = 0;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
