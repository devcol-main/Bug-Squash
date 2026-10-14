import { BugSquashLogic } from './core/BugSquashLogic';
import type { BugSquashConfig } from './core/config';
import { AudioManager } from './audio/AudioManager';
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

  const audio = new AudioManager();
  // 언락: running이 될 때까지 시도하고, 성공하면 리스너를 해제한다.
  // 7번에서 입력 핸들러에 연결 예정. touch의 pointerdown은 user activation이 아니어서
  // iOS에서는 pointerup/touchend에서도 시도해야 한다.
  const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
  const tryUnlock = (): void => {
    const supported = audio.unlock();
    if (!supported || audio.isRunning()) for (const t of UNLOCK_EVENTS) window.removeEventListener(t, tryUnlock);
  };
  for (const t of UNLOCK_EVENTS) window.addEventListener(t, tryUnlock);

  // 탭이 숨겨지면 오디오를 멈춘다. (게임 로직 일시정지는 8번)
  const setAudioPaused = (paused: boolean): void => (paused ? audio.suspend() : audio.resume());
  document.addEventListener('visibilitychange', () => setAudioPaused(document.hidden));
  window.addEventListener('pagehide', () => setAudioPaused(true));
  window.addEventListener('pageshow', () => setAudioPaused(document.hidden));

  let overTime = 0;
  const newLogic = (seed?: number, overrides?: Partial<BugSquashConfig>): BugSquashLogic =>
    new BugSquashLogic(createRng(seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)), overrides);
  let logic = newLogic();
  if (import.meta.env.DEV) {
    window.__bugSquash = {
      logic: () => logic,
      restart: (seed, overrides) => {
        overTime = 0;
        audio.unduck();
        logic = newLogic(seed, overrides);
        renderer.resetFx(logic);
        return logic;
      },
      tap: (cell) => {
        const ev = logic.tap(cell);
        renderer.consume(ev, logic);
        audio.consume(ev);
      },
    };
  }
  let last = performance.now();

  const frame = (now: number): void => {
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    renderer.advanceFx(dt);
    const ev = logic.update(dt);
    renderer.consume(ev, logic);
    audio.consume(ev);
    renderer.render(logic, dt);
    // TEMP: 7번에서 UI 흐름으로 교체
    if (logic.isGameOver) {
      overTime += dt;
      if (overTime >= TEMP_RESTART_DELAY) {
        audio.unduck();
        logic = newLogic();
        renderer.resetFx(logic);
        overTime = 0;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
