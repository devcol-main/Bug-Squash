import { DEFAULT_CONFIG } from '../core/config';
import { createRng } from '../core/rng';
import type { BugSquashEvent, BugSquashLogic } from '../core/BugSquashLogic';
import { expandAnimT, popScale, smoothstep01 } from './anim';
import { cellBox, computeBoardRect, expandCellBox, newCellBox, type BoardRect } from './layout';
import { crtFlickerValue, expandFadeAlphas } from './motionPolicy';
import { shakeAmplitude } from './shake';
import { SpriteId, Sprites } from './sprites';
import { drawFlashes, drawGhosts, drawParticlesAndRings, drawTexts } from './fxDraw';
import { FxState } from './fxState';
import { TextCache } from './fxText';
import { CodeLog, codeLogRows, codeLogUnitWidth } from './codeLog';
import { buildCrtOverlay } from './crtOverlay';
import { VIEW_CONFIG } from './viewConfig';

export class BugSquashRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new Sprites();
  private readonly codeLog = new CodeLog(createRng(VIEW_CONFIG.viewSeed ^ 0x51ed270b));
  private readonly box = newCellBox();
  private readonly fx = new FxState(createRng(VIEW_CONFIG.viewSeed ^ 0x9e3779b9));
  private readonly text = new TextCache();
  private readonly shake = { x: 0, y: 0 };
  private readonly fade = { old: 1, next: 1 };
  private crt: HTMLCanvasElement | null = null;
  /** 깜박임을 끈 모드용: 기본 어둡기를 구워 넣은 오버레이 (처음 필요할 때 한 번 만든다). */
  private crtBaked: HTMLCanvasElement | null = null;
  private dpr = 1;
  private unitW = 6;
  private cssW = 0;
  private cssH = 0;
  private time = 0;
  private _board: BoardRect = { x: 0, y: 0, size: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  /** 현재 보드 사각형 (CSS px). 입력 매핑용. */
  get board(): BoardRect { return this._board; }

  /** 리사이즈/DPR 변경 시에만 호출. CRT 오버레이와 3x3/4x4 스프라이트 세트를 다시 만든다. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, VIEW_CONFIG.maxDpr);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._board = computeBoardRect(w, h);

    this.dpr = dpr;
    this.unitW = codeLogUnitWidth(w);
    this.crt = buildCrtOverlay(w, h, dpr, false);
    this.crtBaked = null;
    this.sprites.build(this._board.size, dpr, [VIEW_CONFIG.smallGrid, DEFAULT_CONFIG.largeBoardSize]);
    this.text.build(this._board.size, dpr);
  }

  /** core 이벤트(update/tap 결과)를 연출로 바꾼다. 버퍼는 이 호출 안에서만 읽는다. */
  consume(events: { length: number; at(i: number): BugSquashEvent }, logic: BugSquashLogic): void {
    this.fx.consume(events, logic.boardSize);
  }

  /** 기존 연출을 dt만큼 진행. 새 이벤트 consume 전에 부른다 (새 연출이 첫 프레임에 t=0 으로 그려지게). */
  advanceFx(dt: number): void { this.fx.update(dt); }

  /** 새 게임 시작 시 남은 연출을 비우고 시작 그리드 크기를 맞춘다. */
  resetFx(logic: BugSquashLogic): void { this.fx.reset(logic.boardSize); }

  /** Reduced motion: 정책은 motionPolicy (흔들림 0, 입자 축소, 확장은 페이드). */
  setReducedMotion(on: boolean): void { this.fx.setReducedMotion(on); }

  /** 폰트 로드 후 호출: 글로우 텍스트 캐시를 다시 만들게 한다. */
  invalidateTextCache(): void { this.text.invalidateTextCache(); }

  private drawCodeLog(ctx: CanvasRenderingContext2D): void {
    const L = VIEW_CONFIG.codeLog;
    const log = this.codeLog;
    const rows = codeLogRows(this.cssH);
    const uw = this.unitW;
    const typed = log.typedFraction();
    ctx.fillStyle = L.color;
    for (let k = 0; k < rows; k++) {
      const slot = log.slotAt(k);
      const y = this.cssH - (k + 1) * L.lineHeight + (L.lineHeight - L.barHeight) / 2;
      // 맨 아래 줄은 타이핑: 전체 길이의 typed 비율까지만 그린다.
      let remain = k === 0 ? Math.ceil(log.total[slot]! * typed) : 1e9;
      if (remain <= 0) continue;
      ctx.globalAlpha = log.alpha[slot]!;
      let x = L.marginX + log.indent[slot]! * L.indentUnits * uw;
      const n = log.barCount[slot]!;
      // 들여쓰기 구간도 타이핑 길이에 포함된다.
      remain -= log.indent[slot]! * L.indentUnits;
      for (let b = 0; b < n && remain > 0; b++) {
        const len = Math.min(log.barLen[slot * L.maxBars + b]!, remain);
        ctx.fillRect(x, y, len * uw - 1, L.barHeight);
        x += (log.barLen[slot * L.maxBars + b]! + 1) * uw;
        remain -= log.barLen[slot * L.maxBars + b]! + 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  render(logic: BugSquashLogic, dt: number): void {
    const ctx = this.ctx;
    const c = VIEW_CONFIG;
    this.time += dt;
    this.codeLog.update(dt);
    const fx = this.fx;

    // 배경: 단색 + 코드 로그 (한 겹, 보드 뒤)
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.drawCodeLog(ctx);

    // 보드 쪽은 화면 흔들림 적용 (배경은 고정)
    const bd = this._board;
    fx.screenShake(this.shake);
    ctx.save();
    ctx.translate(this.shake.x * bd.size, this.shake.y * bd.size);

    // 칸 + 오브젝트
    const grid = logic.boardSize;
    const expanding = logic.isExpanding;
    const policy = fx.policy;
    const prog = smoothstep01(expandAnimT(logic.expandProgress, DEFAULT_CONFIG.expandPause, policy.expandDuration));
    const n = logic.cellCount;
    const box = this.box;
    const dpr = this.dpr;
    const sp = this.sprites.get(grid);
    const spSmall = this.sprites.get(c.smallGrid);
    const fadeExpand = expanding && policy.fadeExpand;
    if (fadeExpand) {
      // 3x3가 사라지고 4x4가 나타난다 (칸 이동 없음). 확장 중에는 오브젝트가 없다(core가 비움).
      const a = expandFadeAlphas(prog, this.fade);
      const small = c.smallGrid;
      for (let j = 0; j < small * small; j++) {
        cellBox(this._board, small, j, box);
        ctx.globalAlpha = a.old;
        ctx.drawImage(spSmall.cellNormal, snap(box.cx - box.size / 2, dpr), snap(box.cy - box.size / 2, dpr), box.size, box.size);
      }
    }
    for (let i = 0; i < n; i++) {
      if (fadeExpand) {
        cellBox(this._board, grid, i, box);
        box.alpha = this.fade.next;
      } else if (expanding) expandCellBox(this._board, c.smallGrid, grid, i, prog, box);
      else cellBox(this._board, grid, i, box);
      const cell = logic.getCell(i);
      const occupied = cell.kind !== null;
      ctx.globalAlpha = box.alpha;
      // 정지 상태에서는 스프라이트 원래 크기로 디바이스 픽셀에 스냅해 그린다 (또렷하게). 확장 중에는 보간 크기.
      const cw = expanding ? box.size : sp.cellPx / dpr;
      const cx0 = expanding ? box.cx - cw / 2 : snap(box.cx - cw / 2, dpr);
      const cy0 = expanding ? box.cy - cw / 2 : snap(box.cy - cw / 2, dpr);
      ctx.drawImage(occupied ? sp.cellBright : sp.cellNormal, cx0, cy0, cw, cw);
      if (!occupied) continue;
      const elapsed = cell.duration - cell.remaining;
      let s = popScale(elapsed, cell.remaining);
      if (s <= 0) continue;
      let id: number;
      switch (cell.kind) {
        case 'hard': id = cell.hp < DEFAULT_CONFIG.hardHp ? SpriteId.HardCracked : SpriteId.Hard; break;
        case 'golden':
          id = SpriteId.Golden;
          s *= 1 + c.goldenPulseAmp * Math.sin(this.time * c.goldenPulseSpeed);
          break;
        case 'feature': id = SpriteId.Feature; break;
        default: id = SpriteId.Bug;
      }
      let ox = 0;
      const sh = fx.cellShake[i]!;
      if (sh >= 0) ox = shakeAmplitude(sh, c.fx.hitShakeDuration, box.size * c.fx.hitShakeAmp * policy.shakeScale) * Math.sin(sh * c.fx.hitShakeFreq);
      if (cell.kind === 'golden') fx.sparkle((box.cx - bd.x) / bd.size, (box.cy - bd.y) / bd.size, box.size / bd.size, dt);
      // 스케일 1(정지)이면 원래 크기로 스냅, 팝/맥동/확장 중에는 분수 스케일(스무딩 허용).
      const natural = s === 1 && !expanding && ox === 0;
      const d = natural ? sp.surfPx / dpr : box.size * s * (1 + 2 * c.objectPad);
      const left = natural ? snap(box.cx - d / 2, dpr) : box.cx + ox - d / 2;
      const top = natural ? snap(box.cy - d / 2, dpr) : box.cy - d / 2;
      ctx.drawImage(sp.objects[id]!, left, top, d, d);
      if (cell.kind === 'golden' && (this.time % c.goldenCursor.period) < c.goldenCursor.period * c.goldenCursor.onRatio) {
        // 깜박이는 터미널 커서 `_`: 버그 바로 아래, 스프라이트 블록 그리드에 스냅
        const k = d / sp.surfPx;
        const cur = sp.cursor;
        ctx.fillStyle = c.goldenCursor.color;
        ctx.fillRect(left + cur.x * k, top + cur.y * k, cur.w * k, cur.h * k);
      }
    }
    ctx.globalAlpha = 1;

    drawFlashes(ctx, fx, bd);
    drawGhosts(ctx, fx, bd, this.sprites);
    drawParticlesAndRings(ctx, fx, bd);
    drawTexts(ctx, fx, bd, this.text);
    ctx.restore();

    // CRT 오버레이 (맨 위): 스캔라인 + 비네팅. 깜박임을 끈 모드는 기본 어둡기를 오버레이에 구워 두어 전체 화면 fillRect 를 생략한다.
    if (policy.crtFlicker) {
      if (this.crt) ctx.drawImage(this.crt, 0, 0, this.cssW, this.cssH);
      ctx.fillStyle = '#000';
      ctx.globalAlpha = c.crt.flickerAmp + crtFlickerValue(policy, this.time);
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    } else {
      this.crtBaked ??= buildCrtOverlay(this.cssW, this.cssH, this.dpr, true);
      ctx.drawImage(this.crtBaked, 0, 0, this.cssW, this.cssH);
    }
  }
}

/** CSS px 좌표를 디바이스 픽셀 경계에 스냅. */
function snap(v: number, dpr: number): number {
  return Math.round(v * dpr) / dpr;
}
