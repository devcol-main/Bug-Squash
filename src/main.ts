import { type LeaderboardEntry, type LeaderboardService } from '../../../shared/leaderboard';
import { BugSquashLogic, type EventBuffer } from './core/BugSquashLogic';
import type { BugSquashConfig } from './core/config';
import { createRng } from './core/rng';
import { AudioManager } from './audio/AudioManager';
import { PointerInput } from './input/PointerInput';
import { setVibrationEnabled, vibrateFeatureTap, vibrateGameOver, vibrateMiss } from './input/vibration';
import { BugSquashRenderer } from './view/BugSquashRenderer';
import { GameFlow } from './ui/flow';
import { ConfirmGate, effectiveReducedMotion, hudBest, reducedMotionStore, resetUserData, vibrationStore } from './ui/options';
import { BestScore, browserStorage } from './ui/records';
import { createBugSquashLeaderboard, createPlayerProfile, makeStats, nicknameToSubmit, type BugSquashStats } from './ui/leaderboard';
import { BugSquashUi } from './ui/BugSquashUi';
import { FrameClock } from './ui/frameClock';
import { PauseController } from './ui/pause';
import { watchDpr } from './ui/dprWatcher';
import { waitForFont } from './ui/fonts';
import { UI_CONFIG } from './ui/uiConfig';
import './ui/ui.css';

declare global {
  interface Window {
    /** 개발 모드 전용 (브라우저 확인용). 프로덕션 번들에는 없다. */
    __bugSquash?: {
      logic(): BugSquashLogic;
      /** 새 게임을 바로 플레이 상태로 시작한다 (타이틀/게임 오버 화면 건너뜀). */
      restart(seed?: number, overrides?: Partial<BugSquashConfig>): BugSquashLogic;
      /** logic.tap(cell) 후 연출까지 재생한다. */
      tap(cell: number): void;
    };
  }
}

const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) {
  const storage = browserStorage();
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const rmStore = reducedMotionStore(storage, UI_CONFIG.reducedMotionKey);
  const vibStore = vibrationStore(storage, UI_CONFIG.vibrationKey);
  // 축소 모드 = OS 설정 OR 수동 설정. 둘 중 하나가 바뀔 때마다 applyReducedMotion으로 view와 UI에 함께 반영한다.
  let osReduced = motionQuery?.matches ?? false;
  let manualReduced = rmStore.load();
  let vibrationOn = vibStore.load();
  setVibrationEnabled(vibrationOn);

  const newLogic = (seed?: number, overrides?: Partial<BugSquashConfig>): BugSquashLogic =>
    new BugSquashLogic(createRng(seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)), overrides);
  // 타이틀 배경용. 실제 판은 startGame에서 새 시드로 만든다.
  let logic = newLogic();

  const renderer = new BugSquashRenderer(canvas);
  const input = new PointerInput(canvas);
  input.setEnabled(false); // 타이틀: 보드 입력은 플레이 상태에서만
  const syncBoard = (): void => input.setBoard(renderer.board, logic.boardSize);
  syncBoard();

  const audio = new AudioManager();
  const flow = new GameFlow(UI_CONFIG.gameOverInputLockSec);
  const ui = new BugSquashUi(UI_CONFIG.leaderboardSize);
  const best = new BestScore(storage, UI_CONFIG.bestKey);
  const profile = createPlayerProfile(storage);
  let leaderboard: LeaderboardService<BugSquashStats> = createBugSquashLeaderboard();
  ui.setMuted(audio.isMuted());
  ui.syncAudio(audio.getSettings());
  ui.setVibration(vibrationOn);
  ui.setTitleBest(best.value);
  ui.setLives(logic.lives, false);
  ui.setMultiplier(1);

  const applyReducedMotion = (): void => {
    const on = effectiveReducedMotion(osReduced, manualReduced);
    renderer.setReducedMotion(on);
    ui.setReducedMotion(on);
  };
  applyReducedMotion();
  motionQuery?.addEventListener('change', (e) => {
    osReduced = e.matches;
    applyReducedMotion();
  });

  /** 이번 판의 결과 (게임 오버 이벤트에서 채움). 제출은 flow.claimSubmit()으로 판당 1회. */
  const result = { score: 0, bugsCaught: 0, maxCombo: 0, time: 0 };

  const refreshBoard = (mine: LeaderboardEntry<BugSquashStats> | null): void => {
    const round = flow.round;
    leaderboard.getTop(UI_CONFIG.leaderboardSize).then(
      (entries) => {
        // 그 사이 재시작했거나 다른 판이면 버린다
        if (flow.round === round && flow.phase === 'gameOver') ui.renderBoard(entries, mine);
      },
      () => {},
    );
  };

  const submitScore = (): void => {
    if (!flow.claimSubmit()) return;
    const nick = nicknameToSubmit(ui.input.value, profile.nickname);
    profile.setNickname(nick);
    const entry: LeaderboardEntry<BugSquashStats> = {
      playerId: profile.playerId,
      nickname: nick,
      score: result.score,
      stats: makeStats(result),
      ts: Date.now(),
    };
    ui.hideNickForm();
    leaderboard.submit(entry).then(
      () => refreshBoard(entry),
      () => refreshBoard(null),
    );
  };

  /** CRT 꺼짐이 끝나기를 기다리는 게임 오버 오버레이. 재시작하면 취소된다. */
  let overlay: { remaining: number; isNewBest: boolean; round: number } | null = null;

  const onGameOver = (): void => {
    if (!flow.endGame()) return;
    input.setEnabled(false);
    result.score = logic.score;
    result.bugsCaught = logic.bugsCaught;
    result.maxCombo = logic.maxCombo;
    result.time = logic.time;
    const isNewBest = best.submit(result.score);
    // 오버레이는 CRT 꺼짐(reduced이면 페이드)이 끝난 뒤에 보인다. flow 상태와 입력 잠금(0.6초)은 바로 시작한다.
    overlay = { remaining: renderer.endDelay, isNewBest, round: flow.round };
  };

  /** 지연된 게임 오버 오버레이를 실제로 띄운다. */
  const showGameOverOverlay = (isNewBest: boolean): void => {
    ui.setPhase('gameOver');
    ui.showGameOver({ score: result.score, best: best.value, isNewBest }, profile.nickname);
    ui.setTitleBest(best.value);
    refreshBoard(null);
  };

  /** tap/update가 돌려준 버퍼를 연출, 소리, 진동, HUD로 보낸다. 버퍼는 이 호출 안에서만 읽는다(다음 tap/update 전까지 유효). */
  const dispatch = (buf: EventBuffer): void => {
    if (buf.length === 0) return;
    renderer.consume(buf, logic);
    audio.consume(buf);
    for (let i = 0; i < buf.length; i++) {
      const ev = buf.at(i);
      switch (ev.type) {
        case 'featureTapped':
          vibrateFeatureTap();
          break;
        case 'missed':
          if (ev.kind !== 'golden') vibrateMiss();
          break;
        case 'boardExpand':
          syncBoard(); // 확장을 consume한 같은 프레임에 입력 매핑을 4x4로
          break;
        case 'gameOver':
          vibrateGameOver();
          onGameOver();
          break;
        default:
          break;
      }
    }
  };

  // 프레임 루프 밖에서 한 번만 생성 (루프 안 클로저 할당 방지)
  const onCell = (cell: number): void => dispatch(logic.tap(cell));

  const isTextTarget = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

  /** 새 판 시작: 새 시드(또는 DEV 지정), 연출/오디오/HUD 초기화. */
  const beginGame = (seed?: number, overrides?: Partial<BugSquashConfig>): void => {
    // 숨겨질 닉네임 입력/버튼에 포커스가 남아 다음 판 Space가 막히지 않게
    const active = document.activeElement;
    if (active instanceof HTMLElement && (isTextTarget(active) || active === ui.retryButton)) active.blur();
    overlay = null;
    logic = newLogic(seed, overrides);
    renderer.resetFx(logic);
    audio.unduck();
    syncBoard();
    input.setEnabled(true);
    ui.setScore(0);
    ui.setMultiplier(1);
    ui.setLives(logic.lives, false);
    ui.setPhase('playing');
  };

  /** 시작/재시작 입력(화면 탭, Space). 플레이 중 보드 탭은 PointerInput이 처리한다. */
  const onTap = (): void => {
    const action = flow.tap();
    if (action === 'start' || action === 'retry') beginGame();
  };

  if (import.meta.env.DEV) {
    window.__bugSquash = {
      logic: () => logic,
      restart: (seed, overrides) => {
        flow.startNow();
        beginGame(seed, overrides);
        return logic;
      },
      tap: (cell) => onCell(cell),
    };
  }

  // iframe 안에서도 키보드(Space)가 먹도록 첫 포인터 입력에서 포커스를 가져온다.
  const grabFocus = (): void => {
    try {
      window.focus();
      canvas.focus({ preventScroll: true });
    } catch {
      // 포커스 불가 환경은 무시
    }
  };

  // 오디오 언락: 첫 사용자 입력에서 시도한다. touch의 pointerdown은 user activation이 아니어서
  // iOS에서는 pointerup/touchend에서도 시도해야 한다. 이미 running이면 unlock()은 가볍다.
  // AudioContext를 쓸 수 없는 환경이면 리스너를 해제한다.
  const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
  const tryUnlock = (): void => {
    if (!audio.unlock()) for (const t of UNLOCK_EVENTS) window.removeEventListener(t, tryUnlock);
  };
  for (const t of UNLOCK_EVENTS) window.addEventListener(t, tryUnlock);

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('[data-ui]')) return;
    grabFocus();
    // 플레이 중의 탭은 canvas의 PointerInput이 큐에 넣는다. 여기서는 타이틀/게임 오버의 시작/재시작만.
    if (flow.phase === 'playing') return;
    e.preventDefault();
    onTap();
  });
  window.addEventListener('keydown', (e) => {
    if (flow.optionsOpen && e.code === 'Escape') {
      closeOptions();
      return;
    }
    if (flow.optionsOpen && e.code === 'Tab') trapTab(e);
    if (isTextTarget(e.target)) return; // 닉네임 입력 중에는 스페이스/M이 게임으로 새지 않는다
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
    if (flow.optionsOpen) return;
    // 포커스된 버튼(retry/Submit/Sound)의 Space/Enter는 각 버튼의 click/submit 핸들러만 처리한다.
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) onTap(); // 플레이 중에는 flow.tap()이 'none'
    }
  });

  // ---- 옵션 패널 ----
  // 패널(#options)은 data-ui라서 안쪽/바깥 클릭이 게임 입력으로 새지 않고, flow.optionsOpen이 tap()도 막는다.
  const resetGate = new ConfirmGate(UI_CONFIG.resetConfirmMs);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelReset = (): void => {
    resetGate.cancel();
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    ui.setResetArmed(false);
  };
  const openOptions = (): void => {
    if (!flow.openOptions()) return;
    ui.setOptionsOpen(true);
    ui.optClose.focus();
  };
  const closeOptions = (): void => {
    if (!flow.optionsOpen) return;
    cancelReset();
    flow.closeOptions();
    ui.setOptionsOpen(false);
    // 열었던 버튼에 포커스가 남아 Space가 패널을 다시 열지 않게 blur
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  };
  /** Tab 포커스를 패널 안에서 순환시킨다. */
  const trapTab = (e: KeyboardEvent): void => {
    const items = ui.optionsPanel.querySelectorAll<HTMLElement>('button, input');
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!(active instanceof Node) || !ui.optionsPanel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };
  ui.optionsButton.addEventListener('click', openOptions);
  ui.optClose.addEventListener('click', closeOptions);
  ui.optSound.addEventListener('click', () => toggleMute());
  ui.optBgm.addEventListener('click', () => audio.setBgmOn(!audio.getSettings().bgmOn));
  ui.optSfx.addEventListener('click', () => audio.setSfxOn(!audio.getSettings().sfxOn));
  ui.optBgmVol.addEventListener('input', () => audio.setBgmVolume(Number(ui.optBgmVol.value) / 100));
  ui.optSfxVol.addEventListener('input', () => audio.setSfxVolume(Number(ui.optSfxVol.value) / 100));
  ui.optVib.addEventListener('click', () => {
    vibrationOn = !vibrationOn;
    vibStore.save(vibrationOn);
    setVibrationEnabled(vibrationOn);
    ui.setVibration(vibrationOn);
  });
  ui.optReduced.addEventListener('click', () => {
    manualReduced = !manualReduced;
    rmStore.save(manualReduced);
    applyReducedMotion();
  });
  ui.optReset.addEventListener('click', () => {
    if (resetGate.press(performance.now()) === 'armed') {
      ui.setResetArmed(true);
      if (resetTimer !== null) clearTimeout(resetTimer);
      resetTimer = setTimeout(cancelReset, UI_CONFIG.resetConfirmMs);
      return;
    }
    cancelReset();
    resetUserData({ best, storage, leaderboardKey: UI_CONFIG.leaderboardKey });
    leaderboard = createBugSquashLeaderboard(); // 메모리에 남은 기록도 비운다
    ui.setTitleBest(best.value);
    ui.refreshAfterReset();
    if (flow.phase === 'gameOver') ui.renderBoard([], null);
  });
  audio.onSettingsChange((s) => ui.syncAudio(s));

  const toggleMute = (): void => {
    ui.setMuted(audio.toggleMute());
  };
  ui.muteButton.addEventListener('click', () => {
    toggleMute();
    ui.muteButton.blur(); // 이후 스페이스가 버튼을 누르지 않게
  });
  // 키보드(Enter/Space로 버튼 활성화)로 누른 click만 처리. 포인터는 pointerdown에서 이미 처리됨(detail 0 = 키보드).
  ui.retryButton.addEventListener('click', (e) => {
    if (e.detail === 0) onTap();
  });
  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitScore();
    ui.input.blur();
  });

  // 리사이즈: window resize, iframe 크기 변경(ResizeObserver), 모바일 주소창(visualViewport)을 모두 받아
  // 프레임당 한 번만 처리한다(스프라이트 재생성 폭주 방지).
  let resizeDirty = false;
  const markResize = (): void => {
    resizeDirty = true;
  };
  window.addEventListener('resize', markResize);
  window.visualViewport?.addEventListener('resize', markResize);
  if (typeof ResizeObserver === 'function') new ResizeObserver(markResize).observe(canvas);

  // 폰트가 준비되면(실패/타임아웃 포함) UI를 보여주고 캔버스 글로우 텍스트 캐시를 다시 만든다.
  void waitForFont().then(() => {
    ui.show();
    renderer.invalidateTextCache();
  });

  // 일시정지: 탭이 숨겨지면 명시적 paused 플래그를 세운다. 프레임 루프는 paused인 동안 update/render를 건너뛰어
  // 시간(노출, 난이도, 게임 오버 입력 잠금)이 흐르지 않는다. 복귀 첫 프레임은 dt = 0, 쌓인 입력은 버린다.
  const clock = new FrameClock(UI_CONFIG.maxFrameDt);
  const pause = new PauseController(clock, {
    clearInput: () => input.clear(),
    suspendAudio: () => audio.suspend(),
    resumeAudio: () => audio.resume(),
  });
  document.addEventListener('visibilitychange', () => pause.set(document.hidden));
  window.addEventListener('pagehide', () => pause.set(true));
  window.addEventListener('pageshow', () => pause.set(document.hidden));
  if (document.hidden) pause.set(true);

  // 모니터를 옮겨 DPR만 바뀐 경우에도 리사이즈 경로를 다시 탄다.
  watchDpr(
    typeof window.matchMedia === 'function' ? (q) => window.matchMedia(q) : null,
    () => window.devicePixelRatio || 1,
    markResize,
  );

  const frame = (now: number): void => {
    const dt = clock.tick(now);
    if (pause.paused) {
      requestAnimationFrame(frame);
      return;
    }
    if (resizeDirty) {
      resizeDirty = false;
      renderer.resize();
      syncBoard();
    }
    renderer.advanceFx(dt);
    flow.update(dt);
    if (overlay) {
      overlay.remaining -= dt;
      if (overlay.remaining <= 0) {
        const o = overlay;
        overlay = null;
        if (flow.round === o.round && flow.phase === 'gameOver') showGameOverOverlay(o.isNewBest);
      }
    }
    if (flow.phase === 'playing') {
      input.drain(onCell);
      if (flow.phase === 'playing') dispatch(logic.update(dt)); // drain 중 게임 오버가 났으면 건너뜀
    }
    ui.setScore(logic.score);
    ui.setMultiplier(logic.multiplier);
    ui.setLives(logic.lives, true);
    ui.setHudBest(hudBest(best.value, logic.score));
    renderer.render(logic, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
