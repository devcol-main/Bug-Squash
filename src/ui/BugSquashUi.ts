import type { LeaderboardEntry } from '../../../../shared/leaderboard';
import type { Phase } from './flow';
import { lifeSlotChange, lifeSlotState, multiplierText, multiplierVisible } from './hud';

/** 클래스를 뺐다 다시 붙여 CSS 애니메이션을 처음부터 재생(이벤트 때만 호출). */
function replayClass(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

function el<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const e = document.getElementById(id);
  if (!(e instanceof ctor)) throw new Error(`#${id} not found`);
  return e;
}

export interface GameOverView {
  score: number;
  best: number;
  isNewBest: boolean;
}

/**
 * HTML 오버레이 UI. 모든 갱신은 값이 바뀔 때만 DOM에 쓴다(매 프레임 호출해도 비용 없음).
 * 오버레이라서 캔버스 화면 흔들림의 영향을 받지 않는다.
 */
export class BugSquashUi {
  readonly root = el('ui', HTMLDivElement);
  readonly muteButton = el('mute', HTMLButtonElement);
  readonly form = el('nick-form', HTMLFormElement);
  readonly input = el('nick', HTMLInputElement);
  readonly retryButton = el('retry', HTMLButtonElement);
  private readonly score = el('score', HTMLDivElement);
  readonly optionsButton = el('options-btn', HTMLButtonElement);
  readonly optionsPanel = el('options', HTMLDivElement);
  readonly optSound = el('opt-sound', HTMLButtonElement);
  readonly optBgm = el('opt-bgm', HTMLButtonElement);
  readonly optBgmVol = el('opt-bgm-vol', HTMLInputElement);
  readonly optSfx = el('opt-sfx', HTMLButtonElement);
  readonly optSfxVol = el('opt-sfx-vol', HTMLInputElement);
  readonly optVib = el('opt-vib', HTMLButtonElement);
  readonly optReduced = el('opt-rm', HTMLButtonElement);
  readonly optReset = el('opt-reset', HTMLButtonElement);
  readonly optClose = el('opt-close', HTMLButtonElement);
  private readonly combo = el('combo', HTMLDivElement);
  private readonly lives = el('lives', HTMLDivElement);
  private readonly hudBest = el('hud-best', HTMLDivElement);
  private readonly titleBest = el('title-best', HTMLDivElement);
  private readonly newBest = el('new-best', HTMLDivElement);
  private readonly finalScore = el('final-score', HTMLDivElement);
  private readonly best = el('best', HTMLDivElement);
  private readonly board = el('board', HTMLOListElement);
  private readonly rows: { li: HTMLLIElement; rank: HTMLSpanElement; name: HTMLSpanElement; pts: HTMLSpanElement }[] = [];
  private readonly emptyRow: HTMLLIElement;
  private readonly lifeIcons: SVGElement[] = [];
  private shownScore = -1;
  private shownMultiplier = -1;
  private shownLives = -1;
  private shownHudBest = -1;
  private shownTitleBest = -1;
  private phase: Phase | '' = '';

  constructor(rowCount: number) {
    for (let i = 0; i < rowCount; i++) {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      const name = document.createElement('span');
      const pts = document.createElement('span');
      rank.className = 'rank';
      name.className = 'name';
      pts.className = 'pts';
      li.append(rank, name, pts);
      li.hidden = true;
      this.board.append(li);
      this.rows.push({ li, rank, name, pts });
    }
    for (const icon of Array.from(this.lives.querySelectorAll<SVGElement>('.life'))) this.lifeIcons.push(icon);
    // 로고 로드 실패 시 깨진 이미지/alt 텍스트 대신 숨긴다(게임 동작과 무관)
    for (const img of Array.from(this.root.querySelectorAll<HTMLImageElement>('.brand-logo'))) {
      const hide = (): void => {
        img.hidden = true;
      };
      img.addEventListener('error', hide);
      if (img.complete && img.naturalWidth === 0) hide();
    }
    this.emptyRow = document.createElement('li');
    this.emptyRow.className = 'empty';
    this.emptyRow.textContent = 'No scores yet';
    this.emptyRow.hidden = true;
    this.board.append(this.emptyRow);
  }

  /** 폰트 준비 후(또는 타임아웃 후) UI를 보여준다. */
  show(): void {
    this.root.classList.add('ready');
  }

  setPhase(p: Phase): void {
    if (p === this.phase) return;
    this.phase = p;
    this.root.dataset.phase = p;
  }

  /** 값이 바뀔 때만 DOM을 갱신. */
  setScore(n: number): void {
    if (n === this.shownScore) return;
    this.shownScore = n;
    this.score.textContent = String(n);
  }

  /** 콤보 배율 표시. 값이 바뀔 때만 DOM 갱신. ×1이면 투명(자리는 유지). */
  setMultiplier(m: number): void {
    if (m === this.shownMultiplier) return;
    this.shownMultiplier = m;
    this.combo.textContent = multiplierText(m);
    this.combo.classList.toggle('on', multiplierVisible(m));
  }

  /** 배율이 오를 때 크게 튀었다 돌아오는 연출. 연속 발생하면 처음부터 다시 재생. */
  popMultiplier(): void {
    replayClass(this.combo, 'pop');
  }

  /**
   * 라이프 다이아몬드 갱신. 값이 바뀔 때만 DOM을 쓴다.
   * animate가 true면 잃은 칸은 깨짐, 회복한 칸은 채움 연출을 재생한다(새 게임 초기화는 false).
   */
  setLives(n: number, animate: boolean): void {
    if (n === this.shownLives) return;
    const prev = this.shownLives < 0 ? n : this.shownLives;
    this.shownLives = n;
    for (let i = 0; i < this.lifeIcons.length; i++) {
      const icon = this.lifeIcons[i]!;
      icon.classList.toggle('full', lifeSlotState(i, n) === 'full');
      icon.classList.remove('break', 'restore');
      const change = animate ? lifeSlotChange(i, prev, n) : 'none';
      if (change !== 'none') {
        void icon.getBoundingClientRect(); // 같은 칸의 연출을 다시 시작하기 위한 reflow (라이프 변화 때만)
        icon.classList.add(change === 'break' ? 'break' : 'restore');
      }
    }
    this.lives.setAttribute('aria-label', `Lives: ${n}`);
  }

  /** 값이 바뀔 때만 DOM 갱신. 0이면 숨긴다. */
  setHudBest(n: number): void {
    if (n === this.shownHudBest) return;
    this.shownHudBest = n;
    this.hudBest.hidden = n <= 0;
    this.hudBest.textContent = `BEST ${n}`;
  }

  setTitleBest(n: number): void {
    if (n === this.shownTitleBest) return;
    this.shownTitleBest = n;
    this.titleBest.hidden = n <= 0;
    this.titleBest.textContent = `BEST ${n}`;
  }

  /** 축소 모드(OS 설정 OR 수동 설정)를 CSS 클래스로 반영. */
  setReducedMotion(on: boolean): void {
    this.root.classList.toggle('reduced', on);
    this.optReduced.textContent = on ? 'On' : 'Off';
    this.optReduced.setAttribute('aria-pressed', String(on));
  }

  setVibration(on: boolean): void {
    this.optVib.textContent = on ? 'On' : 'Off';
    this.optVib.setAttribute('aria-pressed', String(on));
  }

  setMuted(m: boolean): void {
    this.muteButton.textContent = m ? 'Sound: off' : 'Sound: on';
    this.muteButton.setAttribute('aria-pressed', String(m));
    // 옵션의 전체 사운드 토글: On = 소리 켜짐
    this.optSound.textContent = m ? 'Off' : 'On';
    this.optSound.setAttribute('aria-pressed', String(!m));
  }

  /** 오디오 설정을 옵션 컨트롤에 반영. 사용자가 드래그 중인 슬라이더는 건드리지 않는다. */
  syncAudio(a: { bgmOn: boolean; sfxOn: boolean; bgmVolume: number; sfxVolume: number }): void {
    this.optBgm.textContent = a.bgmOn ? 'On' : 'Off';
    this.optBgm.setAttribute('aria-pressed', String(a.bgmOn));
    this.optSfx.textContent = a.sfxOn ? 'On' : 'Off';
    this.optSfx.setAttribute('aria-pressed', String(a.sfxOn));
    const bv = String(Math.round(a.bgmVolume * 100));
    const sv = String(Math.round(a.sfxVolume * 100));
    if (this.optBgmVol.value !== bv) this.optBgmVol.value = bv;
    if (this.optSfxVol.value !== sv) this.optSfxVol.value = sv;
  }

  setOptionsOpen(open: boolean): void {
    this.optionsPanel.hidden = !open;
  }

  /** Reset data 버튼의 확인 단계 표시. */
  setResetArmed(armed: boolean): void {
    this.optReset.textContent = armed ? 'Tap again to confirm' : 'Reset data';
    this.optReset.classList.toggle('armed', armed);
  }

  showGameOver(v: GameOverView, nickname: string): void {
    this.newBest.hidden = !v.isNewBest;
    this.finalScore.textContent = String(v.score);
    this.best.textContent = `BEST ${v.best}`;
    this.form.hidden = false;
    this.input.value = nickname;
    this.clearBoard(); // 로딩 중: 빈 행 문구도 숨김
  }

  /** 데이터 초기화 후 게임 오버 화면의 기록 표시/닉네임 입력을 맞춘다. */
  refreshAfterReset(): void {
    this.best.textContent = 'BEST 0';
    this.newBest.hidden = true;
    // 닉네임 입력칸은 공통 프로필 값이므로 Reset이 건드리지 않는다.
  }

  private clearBoard(): void {
    for (let i = 0; i < this.rows.length; i++) this.rows[i]!.li.hidden = true;
    this.emptyRow.hidden = true;
  }

  hideNickForm(): void {
    this.form.hidden = true;
  }

  /** Top N 표시. mine과 같은 항목(닉네임/점수/ts)을 하이라이트. */
  renderBoard(entries: readonly LeaderboardEntry[], mine: LeaderboardEntry | null): void {
    let highlighted = false;
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]!;
      const e = entries[i];
      if (!e) {
        r.li.hidden = true;
        continue;
      }
      r.li.hidden = false;
      r.rank.textContent = String(i + 1);
      r.name.textContent = e.nickname;
      r.pts.textContent = String(e.score);
      const isMine = !highlighted && mine !== null && e.ts === mine.ts && e.score === mine.score && e.nickname === mine.nickname;
      if (isMine) highlighted = true;
      r.li.classList.toggle('me', isMine);
    }
    this.emptyRow.hidden = entries.length > 0;
  }
}
