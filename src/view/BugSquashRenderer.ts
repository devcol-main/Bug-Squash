import { DEFAULT_CONFIG } from '../core/config';
import { createRng } from '../core/rng';
import type { BugSquashEvent, BugSquashLogic } from '../core/BugSquashLogic';
import { expandAnimT, gridFlickerAlpha, popScale, smoothstep01 } from './anim';
import { cellBox, computeBoardRect, expandCellBox, newCellBox, type BoardRect } from './layout';
import { expandFadeAlphas } from './motionPolicy';
import { shakeAmplitude } from './shake';
import { SpriteId, Sprites } from './sprites';
import { drawFlashes, drawGhosts, drawParticlesAndRings, drawTexts } from './fxDraw';
import { FxState } from './fxState';
import { TextCache } from './fxText';
import { StarField } from './stars';
import { VIEW_CONFIG } from './viewConfig';

export class BugSquashRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new Sprites();
  private readonly stars = new StarField(createRng(VIEW_CONFIG.starSeed));
  private readonly box = newCellBox();
  private readonly fx = new FxState(createRng(VIEW_CONFIG.starSeed ^ 0x9e3779b9));
  private readonly text = new TextCache();
  private readonly shake = { x: 0, y: 0 };
  private readonly fade = { old: 1, next: 1 };
  private gradient: CanvasGradient | null = null;
  private grid: Path2D | null = null;
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

  /** 리사이즈/DPR 변경 시에만 호출. 그라디언트, 그리드, 스프라이트를 다시 만든다. */
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

    const g = this.ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, VIEW_CONFIG.bgTop);
    g.addColorStop(1, VIEW_CONFIG.bgBottom);
    this.gradient = g;
    this.grid = this.buildGrid();
    this.sprites.build(this._board.size / 3, dpr);
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

  private buildGrid(): Path2D {
    const c = VIEW_CONFIG;
    const b = this._board;
    const p = new Path2D();
    const H = this.cssH;
    const W = this.cssW;
    const gy = b.y + b.size * c.gridHorizonRatio;
    if (gy >= H) return p;
    const cx = W / 2;
    const n = c.gridHorizontalLines;
    for (let k = 0; k < n; k++) {
      const y = gy + Math.pow(k / (n - 1), c.gridCurve) * (H - gy);
      p.moveTo(0, y);
      p.lineTo(W, y);
    }
    const top = c.gridSpacingTop * b.size;
    const bottom = c.gridSpacingBottom * b.size;
    const kmax = Math.ceil(cx / bottom) + 1;
    for (let k = -kmax; k <= kmax; k++) {
      p.moveTo(cx + k * top, gy);
      p.lineTo(cx + k * bottom, H);
    }
    return p;
  }

  render(logic: BugSquashLogic, dt: number): void {
    const ctx = this.ctx;
    const c = VIEW_CONFIG;
    this.time += dt;
    this.stars.update(dt);
    const fx = this.fx;

    // 배경
    ctx.fillStyle = this.gradient!;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const fld = this.stars;
    for (let l = 0; l < fld.layerCount; l++) {
      const cfg = c.stars[l]!;
      ctx.globalAlpha = cfg.alpha;
      ctx.fillStyle = cfg.color;
      const end = fld.starts[l + 1]!;
      for (let i = fld.starts[l]!; i < end; i++) {
        ctx.fillRect(fld.u[i]! * this.cssW, fld.screenY(i, l, this.cssH), cfg.size, cfg.size);
      }
    }
    ctx.strokeStyle = c.gridColor;
    ctx.globalAlpha = gridFlickerAlpha(this.time);
    ctx.lineWidth = 1;
    if (this.grid) ctx.stroke(this.grid);
    ctx.globalAlpha = 1;

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
    const sp = this.sprites;
    const fadeExpand = expanding && policy.fadeExpand;
    if (fadeExpand) {
      // 3x3가 사라지고 4x4가 나타난다 (칸 이동 없음). 확장 중에는 오브젝트가 없다(core가 비움).
      const a = expandFadeAlphas(prog, this.fade);
      const small = c.smallGrid;
      for (let j = 0; j < small * small; j++) {
        cellBox(this._board, small, j, box);
        ctx.globalAlpha = a.old;
        ctx.drawImage(sp.cellNormal!, box.cx - box.size / 2, box.cy - box.size / 2, box.size, box.size);
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
      const half = box.size / 2;
      ctx.globalAlpha = box.alpha;
      ctx.drawImage((occupied ? sp.cellBright : sp.cellNormal)!, box.cx - half, box.cy - half, box.size, box.size);
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
      const d = box.size * s * (1 + 2 * c.objectPad);
      ctx.drawImage(sp.objects[id]!, box.cx + ox - d / 2, box.cy - d / 2, d, d);
    }
    ctx.globalAlpha = 1;

    drawFlashes(ctx, fx, bd);
    drawGhosts(ctx, fx, bd, sp);
    drawParticlesAndRings(ctx, fx, bd);
    drawTexts(ctx, fx, bd, this.text);
    ctx.restore();
  }
}

