import { DEFAULT_CONFIG } from '../core/config';
import { createRng } from '../core/rng';
import type { BugSquashLogic } from '../core/BugSquashLogic';
import { expandAnimT, gridFlickerAlpha, popScale, smoothstep01 } from './anim';
import { cellBox, computeBoardRect, expandCellBox, newCellBox, type BoardRect } from './layout';
import { SpriteId, Sprites } from './sprites';
import { StarField } from './stars';
import { VIEW_CONFIG } from './viewConfig';

export class BugSquashRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new Sprites();
  private readonly stars = new StarField(createRng(VIEW_CONFIG.starSeed));
  private readonly box = newCellBox();
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
  }

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

    // 칸 + 오브젝트
    const grid = logic.boardSize;
    const expanding = logic.isExpanding;
    const prog = smoothstep01(expandAnimT(logic.expandProgress, DEFAULT_CONFIG.expandPause, c.expandAnimDuration));
    const n = logic.cellCount;
    const box = this.box;
    const sp = this.sprites;
    for (let i = 0; i < n; i++) {
      if (expanding) expandCellBox(this._board, c.smallGrid, grid, i, prog, box);
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
      const d = box.size * s * (1 + 2 * c.objectPad);
      ctx.drawImage(sp.objects[id]!, box.cx - d / 2, box.cy - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }
}

