// VFX 상태 (DOM/Canvas 없음). 좌표는 "보드 정규화" 기준: (0,0) = 보드 왼쪽 위, (1,1) = 오른쪽 아래.
// 칸 index -> 좌표는 이벤트 시점의 보드 크기로 바꾼다. 그래서 리사이즈해도 연출이 칸에 붙어 있다.
import type { BugSquashEvent, ObjectKind } from '../core/BugSquashLogic';
import { DEFAULT_CONFIG } from '../core/config';
import type { Rng } from '../core/rng';
import { endDuration, motionPolicy, type MotionPolicy } from './motionPolicy';
import { BUG_GRID, FEATURE_GRID, HARD_CRACKED_GRID, filledCells, gridCols, gridRows, type PixelGrid } from './pixelArt';
import { Pool } from './pool';
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;

/** 색 index: 0 bug, 1 hard, 2 golden, 3 red, 4 feature(cyan). */
export const FX_COLORS: readonly string[] = [
  VIEW_CONFIG.colors.bug, VIEW_CONFIG.colors.hard, VIEW_CONFIG.colors.golden, FX.featureColor, VIEW_CONFIG.colors.feature,
];
const RED = 3;
const CYAN = 4;

export const PopupStyle = { Score: 0, Golden: 1 } as const;
export const FlashStyle = { Outline: 0, Invert: 1 } as const;
/** 게임 오버 연출 종류. */
export const EndMode = { None: 0, CrtOff: 1, Fade: 2 } as const;

export interface Particle { active: boolean; u: number; v: number; vu: number; vv: number; grav: number; drag: number; t: number; life: number; size: number; color: number }
export interface Popup { active: boolean; u: number; v: number; frac: number; t: number; text: string; style: number }
export interface Flash { active: boolean; u: number; v: number; frac: number; t: number; dur: number; color: number; style: number }

/** 픽셀 분해용 채운 칸 목록. 종류별로 한 번만 계산한다. */
interface Dissolve { grid: PixelGrid; cells: Int16Array; cols: number; rows: number }
function dissolve(grid: PixelGrid): Dissolve {
  return { grid, cells: filledCells(grid), cols: gridCols(grid), rows: gridRows(grid) };
}
const DISSOLVE_BUG = dissolve(BUG_GRID);
const DISSOLVE_HARD = dissolve(HARD_CRACKED_GRID);
const DISSOLVE_FEATURE = dissolve(FEATURE_GRID);

function dissolveFor(kind: ObjectKind): Dissolve {
  return kind === 'hard' ? DISSOLVE_HARD : kind === 'feature' ? DISSOLVE_FEATURE : DISSOLVE_BUG;
}

/** 샘플링 간격: 기본 sampleStep, reduced(particleScale<1)이면 더 크게. */
export function dissolveStride(particleScale: number): number {
  return Math.max(1, Math.round(FX.dissolveSampleStep / Math.max(0.01, particleScale)));
}
/** 채운 칸이 total개일 때 stride 간격으로 만들어지는 조각 수. */
export function dissolveCount(total: number, stride: number): number {
  return Math.ceil(total / stride);
}

/** 팝업 문자열. 이벤트 시점에만 호출한다. */
export function popupText(points: number, lifeDelta: number): string {
  return lifeDelta > 0 ? '+1 LIFE' : `+${points}`;
}

/** 입자 색 index (스프라이트 색과 같다). */
function colorForKind(kind: ObjectKind | null): number {
  switch (kind) {
    case 'hard': return 1;
    case 'golden': return 2;
    case 'feature': return CYAN;
    default: return 0;
  }
}

/** 칸 index -> 보드 정규화 중심 좌표 (u, v). */
export function cellCenter(cell: number, grid: number): [number, number] {
  return [((cell % grid) + 0.5) / grid, (Math.floor(cell / grid) + 0.5) / grid];
}

export class FxState {
  readonly particles = new Pool<Particle>(FX.particlePool, () => ({ active: false, u: 0, v: 0, vu: 0, vv: 0, grav: 0, drag: 0, t: 0, life: 1, size: 0, color: 0 }));
  readonly popups = new Pool<Popup>(FX.popupPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, text: '', style: 0 }));
  readonly flashes = new Pool<Flash>(FX.flashPool, () => ({ active: false, u: 0, v: 0, frac: 0, t: 0, dur: 1, color: 0, style: 0 }));
  /** 칸 index별 1타 글리치 경과 시간. -1 = 없음. */
  readonly cellGlitch = new Float32Array(16).fill(-1);
  /** 칸별 글리치 띠 오프셋 단위값 (-1..1). 이벤트 시점에 정한다. 인덱스 = 칸 * maxGlitchBands + 띠. */
  readonly cellGlitchUnits = new Float32Array(16 * FX.maxGlitchBands);
  /** 화면 글리치 경과. -1 = 없음. 띠 경계(0..1 지역 비율, bands+1개)와 띠별 오프셋 단위값. */
  screenGlitchT = -1;
  readonly screenGlitchEdges = new Float32Array(FX.screenGlitchBands + 1);
  readonly screenGlitchUnits = new Float32Array(FX.screenGlitchBands);
  /** 게임 오버 연출 경과(-1 = 시작 전), 종류, 지속. 지속이 지나면 endT 는 지속 값에서 멈추고 보드는 비워진 채 유지된다(resetFx 까지). */
  endT = -1;
  endMode: number = EndMode.None;
  endDuration = 0;
  /** SCALING UP 배너 경과. -1 = 없음. */
  bannerT = -1;

  private sparkleAcc = 0;
  private reducedMotion = false;
  /** 격자 크기별 실제 블록 한 변 (칸 한 변 비율). renderer 가 스프라이트 세트와 같은 값을 넣는다. */
  private readonly blockFrac = new Float32Array(8).fill(VIEW_CONFIG.pixelBlock);

  /** 이벤트를 변환할 때 쓰는 현재 그리드 크기. boardExpand 이벤트를 읽는 순간 바뀐다. */
  private gridSize: number;

  constructor(private readonly rng: Rng, gridSize: number = DEFAULT_CONFIG.smallBoardSize) {
    this.gridSize = gridSize;
  }

  /** Reduced motion 설정. 정책 값은 motionPolicy. 기본 off. */
  setReducedMotion(on: boolean): void { this.reducedMotion = on; }
  get isReducedMotion(): boolean { return this.reducedMotion; }
  get policy(): Readonly<MotionPolicy> { return motionPolicy(this.reducedMotion); }
  get particleScale(): number { return this.policy.particleScale; }

  /** 격자 크기별 실제 블록 크기(칸 한 변 비율)를 알려 준다. 리사이즈 때만 호출. */
  setBlockFrac(grid: number, frac: number): void { if (grid >= 0 && grid < this.blockFrac.length) this.blockFrac[grid] = frac; }

  /** 게임 오버 연출이 끝나 보드를 그리지 않는 상태. */
  get boardHidden(): boolean { return this.endT >= 0 && this.endT >= this.endDuration; }

  reset(gridSize: number = this.gridSize): void {
    this.gridSize = gridSize;
    this.particles.clear(); this.popups.clear(); this.flashes.clear();
    this.cellGlitch.fill(-1);
    this.screenGlitchT = -1;
    this.endT = -1; this.endMode = EndMode.None; this.endDuration = 0;
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
        case 'hardHit': this.onHardHit(e, gridSize); break;
        case 'featureTapped': {
          const [u, v] = cellCenter(e.cell, gridSize);
          this.addFlash(u, v, gridSize, RED, FX.invertFlashDuration, FlashStyle.Invert);
          this.dissolveCell(u, v, 1 / gridSize, gridSize, 'feature');
          this.startScreenGlitch();
          break;
        }
        case 'missed':
          if (e.kind !== 'golden') {
            const [u, v] = cellCenter(e.cell, gridSize);
            this.addFlash(u, v, gridSize, RED, FX.missFlashDuration, FlashStyle.Outline);
          }
          break;
        case 'boardExpand': this.bannerT = 0; gridSize = boardSizeNow; break;
        case 'gameOver': this.startEnd(); break;
        default: break;
      }
    }
    this.gridSize = boardSizeNow;
  }

  private addFlash(u: number, v: number, grid: number, color: number, dur: number, style: number): void {
    const f = this.flashes.acquire();
    f.u = u; f.v = v; f.frac = 1 / grid; f.t = 0; f.dur = dur; f.color = color; f.style = style;
  }

  private onHardHit(e: BugSquashEvent, grid: number): void {
    if (e.cell < 0 || e.cell >= 16) return;
    if (this.policy.glitch) {
      this.cellGlitch[e.cell] = 0;
      const rng = this.rng;
      const base = e.cell * FX.maxGlitchBands;
      for (let j = 0; j < FX.maxGlitchBands; j++) this.cellGlitchUnits[base + j] = (rng() * 2 - 1);
    } else {
      // reduced: 글리치 대신 짧은 단순 플래시
      const [u, v] = cellCenter(e.cell, grid);
      this.addFlash(u, v, grid, 1, FX.missFlashDuration, FlashStyle.Outline);
    }
  }

  private startScreenGlitch(): void {
    if (!this.policy.glitch) return;
    const rng = this.rng;
    const n = FX.screenGlitchBands;
    // 경계는 균등 분할 + 띠 폭의 +-screenGlitchEdgeJitter 지터 (단조 증가 보장). 이벤트 시점에만 정한다.
    this.screenGlitchEdges[0] = 0;
    this.screenGlitchEdges[n] = 1;
    for (let k = 1; k < n; k++) this.screenGlitchEdges[k] = (k + (rng() * 2 - 1) * FX.screenGlitchEdgeJitter) / n;
    for (let k = 0; k < n; k++) {
      this.screenGlitchUnits[k] = rng() < FX.screenGlitchShiftChance ? rng() * 2 - 1 : 0;
    }
    this.screenGlitchT = 0;
  }

  private startEnd(): void {
    const p = this.policy;
    this.endT = 0;
    this.endMode = p.crtOff ? EndMode.CrtOff : EndMode.Fade;
    this.endDuration = endDuration(p);
  }

  private onCaught(e: BugSquashEvent, grid: number): void {
    if (e.kind === null || e.cell < 0) return;
    const [u, v] = cellCenter(e.cell, grid);
    const frac = 1 / grid;
    const golden = e.kind === 'golden';
    if (golden) this.addFlash(u, v, grid, 2, FX.invertFlashDuration, FlashStyle.Invert);
    else this.addFlash(u, v, grid, colorForKind(e.kind), FX.flashDuration, FlashStyle.Outline);
    this.dissolveCell(u, v, frac, grid, e.kind);
    const p = this.popups.acquire();
    p.u = u; p.v = v; p.frac = frac; p.t = 0; p.text = popupText(e.points, e.lifeDelta);
    p.style = golden ? PopupStyle.Golden : PopupStyle.Score;
  }

  /** 스프라이트의 채운 칸을 stride 간격으로 입자로 만들어 바깥으로 흩뿌린다. 입자 색 = kind 색. */
  private dissolveCell(u: number, v: number, frac: number, grid: number, kind: ObjectKind): void {
    const d = dissolveFor(kind);
    const color = colorForKind(kind);
    const stride = dissolveStride(this.particleScale);
    const bf = this.blockFrac[grid] ?? VIEW_CONFIG.pixelBlock;
    const rng = this.rng;
    const cells = d.cells;
    const n = cells.length / 2;
    for (let i = 0; i < n; i += stride) {
      const dx = (cells[i * 2]! - d.cols / 2 + 0.5) * bf;
      const dy = (cells[i * 2 + 1]! - d.rows / 2 + 0.5) * bf;
      const p = this.particles.acquire();
      p.u = u + dx * frac; p.v = v + dy * frac;
      // 중심에서 바깥 방향 + 약간의 각도 흔들림
      const a = Math.atan2(dy, dx) + (rng() - 0.5) * FX.dissolveAngleJitter;
      const sp = (FX.dissolveSpeedMin + rng() * (FX.dissolveSpeedMax - FX.dissolveSpeedMin)) * frac;
      p.vu = Math.cos(a) * sp; p.vv = Math.sin(a) * sp;
      p.grav = FX.dissolveGravity * frac; p.drag = FX.dissolveDrag;
      p.t = 0; p.life = FX.dissolveLifeMin + rng() * (FX.dissolveLifeMax - FX.dissolveLifeMin);
      p.size = bf * frac; p.color = color;
    }
  }

  /** 골든이 화면에 있는 동안 매 프레임 호출. 적은 수의 반짝임 입자를 낸다. */
  sparkle(u: number, v: number, frac: number, dt: number): void {
    this.sparkleAcc += dt * FX.sparkleRate * this.policy.sparkleScale;
    const rng = this.rng;
    while (this.sparkleAcc >= 1) {
      this.sparkleAcc -= 1;
      const p = this.particles.acquire();
      p.u = u + (rng() - 0.5) * 2 * FX.sparkleSpread * frac;
      p.v = v + (rng() - 0.5) * 2 * FX.sparkleSpread * frac;
      p.vu = 0; p.vv = -FX.sparkleRise * frac; p.grav = 0; p.drag = 0;
      p.t = 0; p.life = FX.sparkleLife; p.size = FX.sparkleSize * frac; p.color = 2;
    }
  }

  update(dt: number): void {
    const ps = this.particles.items;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) { p.active = false; continue; }
      p.vv += p.grav * dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vu *= damp; p.vv *= damp;
      p.u += p.vu * dt; p.v += p.vv * dt;
    }
    advance(this.popups.items, dt, FX.popupDuration);
    const fl = this.flashes.items;
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i]!;
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) f.active = false;
    }
    for (let i = 0; i < 16; i++) {
      const c = this.cellGlitch[i]!;
      if (c < 0) continue;
      this.cellGlitch[i] = c + dt >= FX.cellGlitchDuration ? -1 : c + dt;
    }
    if (this.screenGlitchT >= 0) {
      this.screenGlitchT += dt;
      if (this.screenGlitchT >= FX.screenGlitchDuration) this.screenGlitchT = -1;
    }
    if (this.endT >= 0 && this.endT < this.endDuration) this.endT = Math.min(this.endDuration, this.endT + dt);
    if (this.bannerT >= 0) {
      this.bannerT += dt;
      if (this.bannerT >= FX.bannerDuration) this.bannerT = -1;
    }
  }
}

function advance(items: { active: boolean; t: number }[], dt: number, dur: number): void {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!it.active) continue;
    it.t += dt;
    if (it.t >= dur) it.active = false;
  }
}
