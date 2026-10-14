// VFX 상태 (DOM/Canvas 없음). 좌표는 "보드 정규화" 기준: (0,0) = 보드 왼쪽 위, (1,1) = 오른쪽 아래.
// 칸 index -> 좌표는 이벤트 시점의 보드 크기로 바꾼다. 그래서 리사이즈해도 연출이 칸에 붙어 있다.
import type { BugSquashEvent, ObjectKind } from '../core/BugSquashLogic';
import { DEFAULT_CONFIG } from '../core/config';
import type { Rng } from '../core/rng';
import { Pool } from './pool';
import { shakeOffset, type Offset2 } from './shake';
import { SpriteId } from './sprites';
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;

/** 색 index: 0 bug, 1 hard, 2 golden, 3 red. */
export const FX_COLORS: readonly string[] = [
  VIEW_CONFIG.colors.bug, VIEW_CONFIG.colors.hard, VIEW_CONFIG.colors.golden, FX.featureColor,
];
const RED = 3;

export const PopupStyle = { Score: 0, Golden: 1 } as const;
export const GhostMode = { Squash: 0, Gear: 1 } as const;

export interface Particle { active: boolean; u: number; v: number; vu: number; vv: number; t: number; life: number; size: number; color: number }
export interface Popup { active: boolean; u: number; v: number; frac: number; t: number; text: string; style: number }
export interface Ring { active: boolean; u: number; v: number; frac: number; t: number; color: number }
export interface Flash { active: boolean; u: number; v: number; frac: number; t: number; dur: number; color: number }
export interface Ghost { active: boolean; u: number; v: number; frac: number; t: number; sprite: number; mode: number }

/** 팝업 문자열. 이벤트 시점에만 호출한다. */
export function popupText(points: number, lifeDelta: number): string {
  return lifeDelta > 0 ? '+1 LIFE' : `+${points}`;
}

function spriteForKind(kind: ObjectKind): number {
  switch (kind) {
    case 'hard': return SpriteId.HardCracked;
    case 'golden': return SpriteId.Golden;
    case 'feature': return SpriteId.Feature;
    default: return SpriteId.Bug;
  }
}

function colorForKind(kind: ObjectKind | null): number {
  switch (kind) {
    case 'hard': return 1;
    case 'golden': return 2;
    case 'feature': return RED;
    default: return 0;
  }
}

/** 칸 index -> 보드 정규화 중심 좌표 (u, v). */
export function cellCenter(cell: number, grid: number): [number, number] {
  return [((cell % grid) + 0.5) / grid, (Math.floor(cell / grid) + 0.5) / grid];
}

export class FxState {
  readonly particles = new Pool<Particle>(FX.particlePool, () => ({ active: false, u: 0, v: 0, vu: 0, vv: 0, t: 0, life: 1, size: 0, color: 0 }));
  readonly popups = new Pool<Popup>(FX.popupPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, text: '', style: 0 }));
  readonly rings = new Pool<Ring>(FX.ringPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, color: 0 }));
  readonly flashes = new Pool<Flash>(FX.flashPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, dur: 1, color: 0 }));
  readonly ghosts = new Pool<Ghost>(FX.ghostPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, sprite: 0, mode: 0 }));
  /** 칸 index별 1타 흔들림 경과 시간. -1 = 없음. */
  readonly cellShake = new Float32Array(16).fill(-1);
  /** 화면 흔들림. */
  shakeElapsed = 0;
  shakeDuration = 0;
  shakeAmp = 0;
  /** SCALING UP 배너 경과. -1 = 없음. */
  bannerT = -1;

  private sparkleAcc = 0;
  private reducedMotion = false;

  /** 이벤트를 변환할 때 쓰는 현재 그리드 크기. boardExpand 이벤트를 읽는 순간 바뀐다. */
  private gridSize: number;

  constructor(private readonly rng: Rng, gridSize: number = DEFAULT_CONFIG.smallBoardSize) {
    this.gridSize = gridSize;
  }

  /** Reduced motion 훅. 실제 연출 축소는 8번에서 이 값을 읽어 적용한다. 기본 off. */
  setReducedMotion(on: boolean): void { this.reducedMotion = on; }
  get isReducedMotion(): boolean { return this.reducedMotion; }
  get shakeScale(): number { return this.reducedMotion ? FX.reduced.shakeScale : 1; }
  get particleScale(): number { return this.reducedMotion ? FX.reduced.particleScale : 1; }

  reset(gridSize: number = this.gridSize): void {
    this.gridSize = gridSize;
    this.particles.clear(); this.popups.clear(); this.rings.clear(); this.flashes.clear(); this.ghosts.clear();
    this.cellShake.fill(-1);
    this.shakeDuration = 0; this.shakeElapsed = 0;
    this.bannerT = -1;
    this.sparkleAcc = 0;
  }

  /** 이벤트 버퍼를 읽어 연출을 만든다. 버퍼는 저장하지 않는다. */
  consume(events: { length: number; at(i: number): BugSquashEvent }, boardSizeNow: number): void {
    // update 가 하위 스텝으로 돌아 한 버퍼에 확장 전 이벤트와 boardExpand 가 같이 올 수 있다.
    // 이벤트 순서대로 그리드를 추적한다 (boardExpand 이전은 이전 크기, 이후는 현재 크기).
    let gridSize = this.gridSize;
    for (let i = 0; i < events.length; i++) {
      const e = events.at(i);
      switch (e.type) {
        case 'caught': this.onCaught(e, gridSize); break;
        case 'hardHit': if (e.cell >= 0 && e.cell < 16) this.cellShake[e.cell] = 0; break;
        case 'featureTapped': {
          const [u, v] = this.cellPos(e.cell, gridSize);
          this.addFlash(u, v, gridSize, RED, FX.flashDuration);
          const g = this.ghosts.acquire();
          g.u = u; g.v = v; g.frac = 1 / gridSize; g.t = 0; g.sprite = SpriteId.Feature; g.mode = GhostMode.Gear;
          this.startShake(FX.screenShakeFeature.duration, FX.screenShakeFeature.amp);
          break;
        }
        case 'missed':
          if (e.kind !== 'golden') {
            const [u, v] = this.cellPos(e.cell, gridSize);
            this.addFlash(u, v, gridSize, RED, FX.missFlashDuration);
          }
          break;
        case 'boardExpand': this.bannerT = 0; gridSize = boardSizeNow; break;
        case 'gameOver': this.startShake(FX.screenShakeGameOver.duration, FX.screenShakeGameOver.amp); break;
        default: break;
      }
    }
    this.gridSize = boardSizeNow;
  }

  private cellPos(cell: number, grid: number): [number, number] {
    return cellCenter(cell, grid);
  }

  private addFlash(u: number, v: number, grid: number, color: number, dur: number): void {
    const f = this.flashes.acquire();
    f.u = u; f.v = v; f.frac = 1 / grid; f.t = 0; f.dur = dur; f.color = color;
  }

  private startShake(duration: number, amp: number): void {
    this.shakeElapsed = 0; this.shakeDuration = duration; this.shakeAmp = amp;
  }

  private onCaught(e: BugSquashEvent, grid: number): void {
    if (e.kind === null || e.cell < 0) return;
    const [u, v] = this.cellPos(e.cell, grid);
    const frac = 1 / grid;
    const color = colorForKind(e.kind);
    const g = this.ghosts.acquire();
    g.u = u; g.v = v; g.frac = frac; g.t = 0; g.sprite = spriteForKind(e.kind); g.mode = GhostMode.Squash;
    this.addFlash(u, v, grid, color, FX.flashDuration);
    const base = e.kind === 'golden' ? FX.goldenParticles : e.kind === 'hard' ? FX.hardCatchParticles : FX.catchParticles;
    this.burst(u, v, frac, color, Math.max(1, Math.round(base * this.particleScale)));
    const p = this.popups.acquire();
    const golden = e.kind === 'golden';
    p.u = u; p.v = v; p.frac = frac; p.t = 0; p.text = popupText(e.points, e.lifeDelta);
    p.style = golden ? PopupStyle.Golden : PopupStyle.Score;
    if (golden) {
      const r = this.rings.acquire();
      r.u = u; r.v = v; r.frac = frac; r.t = 0; r.color = 2;
    }
  }

  private burst(u: number, v: number, frac: number, color: number, count: number): void {
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const p = this.particles.acquire();
      const a = rng() * Math.PI * 2;
      const sp = (FX.particleSpeedMin + rng() * (FX.particleSpeedMax - FX.particleSpeedMin)) * frac;
      p.u = u; p.v = v; p.vu = Math.cos(a) * sp; p.vv = Math.sin(a) * sp;
      p.t = 0; p.life = FX.particleLife * (0.7 + rng() * 0.6);
      p.size = FX.particleSize * frac * this.particleScale; p.color = color;
    }
  }

  /** 골든이 화면에 있는 동안 매 프레임 호출. 적은 수의 반짝임 입자를 낸다. */
  sparkle(u: number, v: number, frac: number, dt: number): void {
    this.sparkleAcc += dt * FX.sparkleRate * this.particleScale;
    const rng = this.rng;
    while (this.sparkleAcc >= 1) {
      this.sparkleAcc -= 1;
      const p = this.particles.acquire();
      p.u = u + (rng() - 0.5) * 2 * FX.sparkleSpread * frac;
      p.v = v + (rng() - 0.5) * 2 * FX.sparkleSpread * frac;
      p.vu = 0; p.vv = -FX.sparkleRise * frac;
      p.t = 0; p.life = FX.sparkleLife; p.size = FX.sparkleSize * frac; p.color = 2;
    }
  }

  update(dt: number): void {
    const ps = this.particles.items;
    const drag = Math.max(0, 1 - FX.particleDrag * dt);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) { p.active = false; continue; }
      p.u += p.vu * dt; p.v += p.vv * dt;
      p.vu *= drag; p.vv *= drag;
    }
    advance(this.popups.items, dt, FX.popupDuration);
    advance(this.rings.items, dt, FX.ringDuration);
    const gs = this.ghosts.items;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i]!;
      if (!g.active) continue;
      g.t += dt;
      if (g.t >= ghostDuration(g.mode)) g.active = false;
    }
    const fl = this.flashes.items;
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i]!;
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) f.active = false;
    }
    for (let i = 0; i < 16; i++) {
      const c = this.cellShake[i]!;
      if (c < 0) continue;
      this.cellShake[i] = c + dt >= FX.hitShakeDuration ? -1 : c + dt;
    }
    if (this.shakeDuration > 0) {
      this.shakeElapsed += dt;
      if (this.shakeElapsed >= this.shakeDuration) this.shakeDuration = 0;
    }
    if (this.bannerT >= 0) {
      this.bannerT += dt;
      if (this.bannerT >= FX.bannerDuration) this.bannerT = -1;
    }
  }

  /** 화면 흔들림 오프셋 (보드 한 변 비율). */
  screenShake(out: Offset2): Offset2 {
    if (this.shakeDuration <= 0) { out.x = 0; out.y = 0; return out; }
    return shakeOffset(this.shakeElapsed, this.shakeDuration, this.shakeAmp * this.shakeScale, FX.screenShakeFreqX, FX.screenShakeFreqY, out);
  }
}

export function ghostDuration(mode: number): number {
  return mode === GhostMode.Gear ? FX.gearDuration : FX.squashDuration;
}

function advance(items: { active: boolean; t: number }[], dt: number, dur: number): void {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!it.active) continue;
    it.t += dt;
    if (it.t >= dur) it.active = false;
  }
}
