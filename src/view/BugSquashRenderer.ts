import { DEFAULT_CONFIG } from '../core/config';
import { createRng } from '../core/rng';
import type { BugSquashEvent, BugSquashLogic } from '../core/BugSquashLogic';
import { expandAnimT, popScale, smoothstep01 } from './anim';
import { crtOffCurve, endFadeAlpha, glitchOffset, type CrtOffState } from './fxCurves';
import { cellBox, computeBoardRect, expandCellBox, newCellBox, type BoardRect } from './layout';
import { crtFlickerValue, endDuration, expandFadeAlphas } from './motionPolicy';
import { pixelBlockPx } from './objectBounds';
import { SpriteId, Sprites } from './sprites';
import { drawFlashes, drawParticles, drawTexts } from './fxDraw';
import { EndMode, FxState } from './fxState';
import { TextCache } from './fxText';
import { KeyHintCache, shouldDrawKeyHint } from './keyHints';
import { CodeLog, codeLogRows, codeLogUnitWidth } from './codeLog';
import { buildCrtOverlay } from './crtOverlay';
import { layerSpan, newSnappedSquare, snapSquareEven } from './pixelSnap';
import { VIEW_CONFIG } from './viewConfig';

export class BugSquashRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new Sprites();
  private readonly codeLog = new CodeLog(createRng(VIEW_CONFIG.viewSeed ^ 0x51ed270b));
  private readonly box = newCellBox();
  private readonly goldenQ = newSnappedSquare();
  private readonly fx = new FxState(createRng(VIEW_CONFIG.viewSeed ^ 0x9e3779b9));
  private readonly text = new TextCache();
  private readonly keyHints = new KeyHintCache();
  /** 칸 키가 한 번 수락된 뒤 true. 저장하지 않는다. */
  private showKeyHints = false;
  private readonly crtOff: CrtOffState = { scaleX: 1, scaleY: 1, glow: 0 };
  /** 화면 글리치/CRT 꺼짐용 오프스크린 레이어 (보드 + fx만). 해당 연출 중에만 그린다. */
  private layer: HTMLCanvasElement | null = null;
  private layerCtx: CanvasRenderingContext2D | null = null;
  private layerY0 = 0;
  private layerY1 = 0;
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
    this.crt = null; // 깜박임 오버레이/구운 오버레이 모두 필요할 때 지연 생성
    this.crtBaked = null;
    this.sprites.build(this._board.size, dpr, [VIEW_CONFIG.smallGrid, DEFAULT_CONFIG.largeBoardSize]);
    this.text.build(this._board.size, dpr);
    this.keyHints.build(this._board.size, dpr, [VIEW_CONFIG.smallGrid, DEFAULT_CONFIG.largeBoardSize]);
    // 픽셀 분해 조각 크기 = 스프라이트가 실제로 그리는 정수 블록 크기 (스프라이트 세트와 같은 식).
    for (const n of [VIEW_CONFIG.smallGrid, DEFAULT_CONFIG.largeBoardSize]) {
      const px = Math.max(8, Math.round((this._board.size / n) * dpr));
      this.fx.setBlockFrac(n, pixelBlockPx(px) / px);
    }
    this.buildLayer();
  }

  /**
   * 보드 위아래로 팝업 여유(layerPad)를 더한 가로 띠(높이 layerY1 - layerY0)만큼만 오프스크린 캔버스를 만든다. 리사이즈 때만.
   * 그릴 때 translate(0, -layerY0)로 메인 캔버스와 같은 좌표를 쓴다.
   */
  private buildLayer(): void {
    const b = this._board;
    const pad = (b.size / DEFAULT_CONFIG.smallBoardSize) * VIEW_CONFIG.fx.layerPad;
    // 시작 y 를 디바이스 px 격자에 맞춘다 (DPR 1.5 에서 합성이 반 픽셀 어긋나지 않게). 높이는 정수 디바이스 px.
    const span = layerSpan(b.y - pad, b.y + b.size + pad, this.cssH, this.dpr);
    this.layerY0 = span.y0;
    this.layerY1 = span.y1;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = span.heightPx;
    const g = c.getContext('2d');
    this.layer = g ? c : null;
    this.layerCtx = g;
    g?.setTransform(this.dpr, 0, 0, this.dpr, 0, -this.layerY0 * this.dpr);
  }

  /** 게임 오버 오버레이를 늦출 시간(초): 현재 정책의 종료 연출 길이. */
  get endDelay(): number { return endDuration(this.fx.policy); }

  /** core 이벤트(update/tap 결과)를 연출로 바꾼다. 버퍼는 이 호출 안에서만 읽는다. */
  consume(events: { length: number; at(i: number): BugSquashEvent }, logic: BugSquashLogic): void {
    this.fx.consume(events, logic.boardSize);
  }

  /** 기존 연출을 dt만큼 진행. 새 이벤트 consume 전에 부른다 (새 연출이 첫 프레임에 t=0 으로 그려지게). */
  advanceFx(dt: number): void { this.fx.update(dt); }

  /** 새 게임 시작 시 남은 연출을 비우고 시작 그리드 크기를 맞춘다. */
  resetFx(logic: BugSquashLogic): void { this.fx.reset(logic.boardSize); }

  /** Reduced motion: 정책은 motionPolicy (글리치/CRT 꺼짐/타이핑 끔, 조각 축소, 확장은 페이드). */
  setReducedMotion(on: boolean): void { this.fx.setReducedMotion(on); }

  /** 칸 키 힌트(왼쪽 위 타이틀바 자리의 키 글자) 켜기/끄기. 기본 꺼짐. */
  setKeyHints(on: boolean): void { this.showKeyHints = on; }
  get keyHintsOn(): boolean { return this.showKeyHints; }

  /** 폰트 로드 후 호출: 글로우 텍스트 캐시를 다시 만들게 한다. */
  invalidateTextCache(): void { this.text.invalidateTextCache(); this.keyHints.invalidate(); }

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
    const policy = fx.policy;

    // 배경: 단색 + 코드 로그 (한 겹, 보드 뒤)
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.drawCodeLog(ctx);

    // 보드 + fx 레이어. 게임 오버 연출(CRT 꺼짐/페이드)이나 화면 글리치 중에는 오프스크린에 그린 뒤 변형해서 합성한다.
    // 평소에는 메인 캔버스에 바로 그린다. (게임 오버 연출이 끝나면 resetFx 전까지 비워 둔다.)
    const ending = fx.endT >= 0;
    const layered = this.layer !== null && (ending ? !fx.boardHidden : fx.screenGlitchT >= 0);
    if (!(ending && fx.boardHidden)) {
      if (layered) {
        const lg = this.layerCtx!;
        // 정수 디바이스 px로 1px 여유를 두고 지운다 (DPR 1.5에서 반쯤 남는 줄 방지).
        const d = this.dpr;
        lg.clearRect(-1 / d, this.layerY0 - 1 / d, this.cssW + 2 / d, this.layerY1 - this.layerY0 + 2 / d);
        this.drawBoardLayer(lg, logic, dt);
        if (ending) this.compositeEnd(ctx); else this.compositeGlitch(ctx);
      } else {
        this.drawBoardLayer(ctx, logic, dt);
      }
    }

    // CRT 오버레이 (맨 위): 스캔라인 + 비네팅. 깜박임을 끈 모드는 기본 어둡기를 오버레이에 구워 두어 전체 화면 fillRect 를 생략한다.
    if (policy.crtFlicker) {
      this.crt ??= buildCrtOverlay(this.cssW, this.cssH, this.dpr, false);
      ctx.drawImage(this.crt, 0, 0, this.cssW, this.cssH);
      ctx.fillStyle = '#000';
      ctx.globalAlpha = c.crt.flickerAmp + crtFlickerValue(policy, this.time);
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    } else {
      this.crtBaked ??= buildCrtOverlay(this.cssW, this.cssH, this.dpr, true);
      ctx.drawImage(this.crtBaked, 0, 0, this.cssW, this.cssH);
    }
  }

  /** 칸 + 오브젝트 + fx를 g 에 그린다. */
  private drawBoardLayer(g: CanvasRenderingContext2D, logic: BugSquashLogic, dt: number): void {
    const c = VIEW_CONFIG;
    const fx = this.fx;
    const bd = this._board;
    const policy = fx.policy;
    g.save();
    // 칸 + 오브젝트
    const grid = logic.boardSize;
    const expanding = logic.isExpanding;
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
        g.globalAlpha = a.old;
        g.drawImage(spSmall.cellNormal, snap(box.cx - box.size / 2, dpr), snap(box.cy - box.size / 2, dpr), box.size, box.size);
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
      g.globalAlpha = box.alpha;
      // 정지 상태에서는 스프라이트 원래 크기로 디바이스 픽셀에 스냅해 그린다 (또렷하게). 확장 중에는 보간 크기.
      const cw = expanding ? box.size : sp.cellPx / dpr;
      const cx0 = expanding ? box.cx - cw / 2 : snap(box.cx - cw / 2, dpr);
      const cy0 = expanding ? box.cy - cw / 2 : snap(box.cy - cw / 2, dpr);
      g.drawImage(occupied ? sp.cellBright : sp.cellNormal, cx0, cy0, cw, cw);
      const hint = this.showKeyHints ? this.keyHints.get(grid, i) : undefined;
      if (shouldDrawKeyHint(this.showKeyHints, hint)) {
        const k = cw / this.keyHints.cellCss(grid);
        const hx = cx0 + hint.x * k;
        const hy = cy0 + hint.y * k;
        g.drawImage(hint.canvas, expanding ? hx : snap(hx, dpr), expanding ? hy : snap(hy, dpr), hint.w * k, hint.h * k);
      }
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
      if (cell.kind === 'golden') fx.sparkle((box.cx - bd.x) / bd.size, (box.cy - bd.y) / bd.size, box.size / bd.size, dt);
      // 스케일 1(정지)이면 원래 크기로 스냅, 팝/맥동/확장 중에는 분수 스케일(스무딩 허용).
      const gl = fx.cellGlitch[i]!;
      const glitching = gl >= 0 && policy.glitch && !expanding;
      const natural = s === 1 && !expanding;
      const d = natural ? sp.surfPx / dpr : box.size * s * (1 + 2 * c.objectPad);
      let left = natural ? snap(box.cx - d / 2, dpr) : box.cx - d / 2;
      let top = natural ? snap(box.cy - d / 2, dpr) : box.cy - d / 2;
      let dd = d;
      if (cell.kind === 'golden' && !expanding) {
        // 맥동 중에도 짝수 정수 디바이스 px 크기 + 격자 위치로 그린다 (흐려짐 방지).
        // 절충: 짝수 반올림 때문에 스프라이트 surfPx 가 홀수면 s=1 이어도 원래 크기로 그려지지 않고,
        // 중심이 일반 버그와 최대 0.5 디바이스 px 다를 수 있다. 선명도를 위해 의도한 것이다.
        const q = snapSquareEven(box.cx, box.cy, d, dpr, this.goldenQ);
        left = q.left; top = q.top; dd = q.size;
      }
      if (glitching) this.drawGlitched(g, sp.objects[id]!, sp.surfPx, left, top, dd, i, gl, box.size);
      else g.drawImage(sp.objects[id]!, left, top, dd, dd);
      if (cell.kind === 'golden' && (this.time % c.goldenCursor.period) < c.goldenCursor.period * c.goldenCursor.onRatio) {
        // 깜박이는 터미널 커서 `_`: 버그 바로 아래, 스프라이트 블록 그리드에 스냅
        const k = dd / sp.surfPx;
        const cur = sp.cursor;
        g.fillStyle = c.goldenCursor.color;
        g.fillRect(left + cur.x * k, top + cur.y * k, cur.w * k, cur.h * k);
      }
    }
    g.globalAlpha = 1;

    drawFlashes(g, fx, bd);
    drawParticles(g, fx, bd);
    drawTexts(g, fx, bd, this.text);
    g.restore();
  }

  /** 단단한 버그 1타: 스프라이트를 가로 띠로 나눠 띠마다 다른 x 오프셋으로 그린다 (소스 사각형 지정, 할당 없음). */
  private drawGlitched(g: CanvasRenderingContext2D, img: HTMLCanvasElement, surf: number, left: number, top: number, d: number, cell: number, elapsed: number, boxSize: number): void {
    const F = VIEW_CONFIG.fx;
    const bands = F.cellGlitchBands;
    const k = d / surf;
    const amp = F.cellGlitchAmp * boxSize;
    for (let j = 0; j < bands; j++) {
      const sy = Math.floor((j * surf) / bands);
      const sh = Math.floor(((j + 1) * surf) / bands) - sy;
      if (sh <= 0) continue;
      const dx = glitchOffset(this.fx.cellGlitchUnits[cell * F.maxGlitchBands + j]!, elapsed, F.cellGlitchDuration, amp, true);
      g.drawImage(img, 0, sy, surf, sh, left + dx, top + sy * k, d, sh * k);
    }
  }

  /** 화면 글리치: 레이어를 가로 띠로 나눠 띠마다 다른 x 오프셋으로 합성한다 (띠 N번 drawImage). */
  private compositeGlitch(ctx: CanvasRenderingContext2D): void {
    const fx = this.fx;
    const L = this.layer!;
    const dpr = this.dpr;
    const n = VIEW_CONFIG.fx.screenGlitchBands;
    const h = this.layerY1 - this.layerY0;
    const amp = VIEW_CONFIG.fx.screenGlitchAmp * this._board.size;
    for (let k = 0; k < n; k++) {
      const sy = Math.round(fx.screenGlitchEdges[k]! * h * dpr);
      const ey = Math.round(fx.screenGlitchEdges[k + 1]! * h * dpr);
      if (ey <= sy) continue;
      const dx = glitchOffset(fx.screenGlitchUnits[k]!, fx.screenGlitchT, VIEW_CONFIG.fx.screenGlitchDuration, amp, fx.policy.glitch);
      ctx.drawImage(L, 0, sy, L.width, ey - sy, dx, this.layerY0 + sy / dpr, this.cssW, (ey - sy) / dpr);
    }
  }

  /** 게임 오버: CRT 꺼짐(세로 수축 + 밝은 가로선 -> 점) 또는 reduced 짧은 페이드. */
  private compositeEnd(ctx: CanvasRenderingContext2D): void {
    const fx = this.fx;
    const F = VIEW_CONFIG.fx;
    const L = this.layer!;
    const y0 = this.layerY0;
    const h = this.layerY1 - y0;
    const cy = y0 + h / 2;
    const sy = 0;
    const sh = L.height;
    if (fx.endMode === EndMode.Fade) {
      ctx.globalAlpha = endFadeAlpha(fx.endT, fx.endDuration);
      ctx.drawImage(L, 0, sy, L.width, sh, 0, y0, this.cssW, h);
      ctx.globalAlpha = 1;
      return;
    }
    const s = crtOffCurve(fx.endT, fx.endDuration, this.crtOff);
    const w = this.cssW * s.scaleX;
    const hh = h * s.scaleY;
    const x = (this.cssW - w) / 2;
    const th = Math.max(hh, F.crtOffLinePx);
    if (s.scaleX >= 1) {
      ctx.drawImage(L, 0, sy, L.width, sh, x, cy - hh / 2, w, hh);
      ctx.fillStyle = F.crtOffColor;
      ctx.globalAlpha = s.glow * s.glow;
      ctx.fillRect(x, cy - th / 2, w, th);
    } else {
      ctx.fillStyle = F.crtOffColor;
      ctx.globalAlpha = 1;
      ctx.fillRect(x, cy - F.crtOffLinePx / 2, Math.max(w, F.crtOffLinePx), F.crtOffLinePx);
    }
    ctx.globalAlpha = 1;
  }

}

/** CSS px 좌표를 디바이스 픽셀 경계에 스냅. */
function snap(v: number, dpr: number): number {
  return Math.round(v * dpr) / dpr;
}
