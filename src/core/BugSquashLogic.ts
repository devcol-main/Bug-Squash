import { cellCount, isValidCell } from './board';
import { DEFAULT_CONFIG, type BugSquashConfig } from './config';
import { exposureTime, maxConcurrent } from './difficulty';
import type { Rng } from './rng';
import { multiplierForCombo } from './scoring';
import { Spawner, type ObjectKind } from './Spawner';

export type { ObjectKind } from './Spawner';

export type BugSquashEventType =
  | 'spawn' // 오브젝트 출현. cell, kind
  | 'caught' // 버그 잡음. cell, kind, points(배율 적용), multiplier, combo(잡은 뒤), lifeDelta(골든 +1 가능)
  | 'hardHit' // 단단한 버그 1타(아직 남아 있음). cell, kind
  | 'missed' // 버그 노출 시간 종료. cell, kind, lifeDelta(-1, 골든은 0)
  | 'featureTapped' // 기능 탭. cell, lifeDelta -1 (기능은 즉시 사라짐)
  | 'featureExpired' // 기능이 그냥 사라짐. 변화 없음
  | 'emptyTap' // 빈 칸 탭. cell
  | 'cleared' // 보드 확장으로 페널티 없이 제거됨. cell, kind
  | 'lifeChanged' // lives(변화 후), lifeDelta
  | 'comboReset' // combo = 리셋 직전 콤보
  | 'multiplierUp' // multiplier(오른 뒤)
  | 'boardExpand' // 3x3 -> 4x4 확장 시작. boardSize 는 getter로 조회 (이미 4)
  | 'gameOver';

/**
 * 모든 필드를 항상 채우는 플랫 구조(재사용 버퍼용). 이벤트 종류별로 의미 있는 필드는
 * BugSquashEventType 주석 참고. 의미 없는 필드는 기본값(0 / null).
 */
export interface BugSquashEvent {
  type: BugSquashEventType;
  cell: number;
  kind: ObjectKind | null;
  points: number;
  multiplier: number;
  combo: number;
  lives: number;
  lifeDelta: number;
}

const EVENT_CAPACITY = 256;

/**
 * 이벤트 버퍼. tap/update 는 매 호출마다 같은 인스턴스를 비우고 다시 채워 돌려준다.
 * 따라서 반환된 버퍼와 그 안의 이벤트 객체는 "다음 tap/update/forceSpawn 호출 전까지"만 유효하다.
 * 필요하면 호출 쪽에서 즉시 읽거나 복사할 것.
 * 용량(256)을 넘으면 마지막 슬롯을 계속 덮어써서 이전 이벤트가 유실된다. 호출 쪽(main)이 dt를
 * 제한(예: 프레임 dt 상한)해서 이 상황이 생기지 않게 한다는 전제다.
 */
export class EventBuffer {
  readonly items: BugSquashEvent[] = [];
  length = 0;
  constructor() {
    for (let i = 0; i < EVENT_CAPACITY; i++) {
      this.items.push({ type: 'spawn', cell: -1, kind: null, points: 0, multiplier: 1, combo: 0, lives: 0, lifeDelta: 0 });
    }
  }
  at(i: number): BugSquashEvent {
    return this.items[i] as BugSquashEvent;
  }
}

/** 칸 하나의 상태. 인스턴스는 고정(최대 16칸)이며 재사용된다. kind === null 이면 빈 칸. */
export interface CellObject {
  kind: ObjectKind | null;
  /** 남은 타수. 단단한 버그는 2에서 시작. */
  hp: number;
  /** 남은 노출 시간(초). */
  remaining: number;
  /** 출현 시 정해진 전체 노출 시간(초). */
  duration: number;
}

const MAX_CELLS = 16;

export class BugSquashLogic {
  private readonly cfg: BugSquashConfig;
  private readonly spawner: Spawner;
  private readonly cells: CellObject[] = [];
  private readonly cooldowns = new Float64Array(MAX_CELLS);
  private readonly free = new Int32Array(MAX_CELLS);
  private readonly buf = new EventBuffer();

  private _score = 0;
  private _combo = 0;
  private _maxCombo = 0;
  private _lives: number;
  private _bugsCaught = 0;
  private _time = 0;
  private _size: number;
  private _expanded = false;
  private expandRemaining = 0;
  private _gameOver = false;
  private active = 0;
  private goldenActive = false;

  constructor(rng: Rng, overrides: Partial<BugSquashConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...overrides };
    this.spawner = new Spawner(rng, this.cfg);
    this._lives = this.cfg.startLives;
    this._size = this.cfg.smallBoardSize;
    for (let i = 0; i < MAX_CELLS; i++) this.cells.push({ kind: null, hp: 0, remaining: 0, duration: 0 });
  }

  // ---- 상태 조회 ----
  get score(): number { return this._score; }
  get combo(): number { return this._combo; }
  get maxCombo(): number { return this._maxCombo; }
  get multiplier(): number { return multiplierForCombo(this._combo, this.cfg); }
  get lives(): number { return this._lives; }
  get boardSize(): number { return this._size; }
  get cellCount(): number { return cellCount(this._size); }
  /** 플레이 시간(초). update(dt)의 dt 누적. */
  get time(): number { return this._time; }
  /** 확장 연출 중(출현 정지, 탭 무시). */
  get isExpanding(): boolean { return this.expandRemaining > 1e-9; }
  get isGameOver(): boolean { return this._gameOver; }
  get bugsCaught(): number { return this._bugsCaught; }
  /** 확장 연출 진행도 0..1 (연출 중이 아니면 1, 확장 전이면 0). */
  get expandProgress(): number {
    if (!this._expanded) return 0;
    return this.isExpanding ? 1 - this.expandRemaining / this.cfg.expandPause : 1;
  }
  get activeCount(): number { return this.active; }
  /** 칸 상태(읽기 전용으로 쓸 것). 반환 객체는 재사용된다. */
  getCell(i: number): Readonly<CellObject> { return this.cells[i] as CellObject; }
  /** 칸의 노출 경과 비율 0..1 (빈 칸은 0). */
  cellElapsed(i: number): number {
    const c = this.cells[i] as CellObject;
    return c.kind === null || c.duration <= 0 ? 0 : Math.min(1, Math.max(0, 1 - c.remaining / c.duration));
  }

  // ---- 입력 ----
  /**
   * 칸 탭. 게임 오버 후, 확장 연출 중(보드가 움직이는 동안 억울한 콤보 리셋 방지),
   * 범위 밖 인덱스는 무시(빈 이벤트). 반환 버퍼 유효 기간: 다음 호출 전까지.
   */
  tap(cell: number): EventBuffer {
    this.buf.length = 0;
    if (this._gameOver || this.isExpanding || !isValidCell(cell, this._size)) return this.buf;
    const o = this.cells[cell] as CellObject;
    if (o.kind === null) {
      this.emit('emptyTap', cell, null);
      this.resetCombo();
      return this.buf;
    }
    const kind = o.kind;
    if (kind === 'feature') {
      this.removeObject(cell);
      this.emit('featureTapped', cell, kind).lifeDelta = -1;
      this.resetCombo();
      this.loseLife();
      return this.buf;
    }
    if (o.hp > 1) {
      o.hp--;
      this.emit('hardHit', cell, kind);
      return this.buf;
    }
    this.removeObject(cell);
    this.catchBug(cell, kind);
    return this.buf;
  }

  // ---- 시간 ----
  /** dt(초) 진행. 큰 dt 도 하위 스텝으로 쪼개 처리. 반환 버퍼 유효 기간: 다음 호출 전까지. */
  update(dt: number): EventBuffer {
    this.buf.length = 0;
    if (this._gameOver || !Number.isFinite(dt) || dt <= 0) return this.buf;
    let left = dt;
    while (left > 1e-12 && !this._gameOver) {
      let h = Math.min(left, this.cfg.maxStep);
      if (!this._expanded) {
        const toExpand = this.cfg.expandAt - this._time;
        if (toExpand > 0 && h > toExpand) h = toExpand;
      }
      left -= h;
      this.step(h);
    }
    return this.buf;
  }

  /**
   * test/debug only — do not call from game code; bypasses caps, cooldown, golden limit,
   * expansion pause and game over.
   * 테스트/디버그 전용: 지정 칸에 오브젝트를 직접 둔다(이미 있으면 덮어쓴다).
   * duration 을 생략하면 현재 난이도의 노출 시간(종류 배율 포함). 쿨다운과 동시 최대 수는 무시한다.
   */
  forceSpawn(cell: number, kind: ObjectKind, duration?: number): EventBuffer {
    this.buf.length = 0;
    if (!isValidCell(cell, this._size)) return this.buf;
    this.place(cell, kind, duration ?? this.durationFor(kind));
    return this.buf;
  }

  // ---- 내부 ----
  private step(h: number): void {
    this._time += h;
    if (!this._expanded && this._time >= this.cfg.expandAt - 1e-9) this._time = this.cfg.expandAt;
    for (let i = 0; i < MAX_CELLS; i++) {
      const cd = this.cooldowns[i] as number;
      if (cd > 0) this.cooldowns[i] = cd - h;
    }
    if (this.expandRemaining > 0) this.expandRemaining -= h;

    if (!this._expanded && this._time >= this.cfg.expandAt) {
      this.expand();
      return;
    }

    const n = cellCount(this._size);
    for (let i = 0; i < n; i++) {
      const o = this.cells[i] as CellObject;
      if (o.kind === null) continue;
      o.remaining -= h;
      if (o.remaining > 0) continue;
      const kind = o.kind;
      this.removeObject(i);
      if (kind === 'feature') {
        this.emit('featureExpired', i, kind);
      } else if (kind === 'golden') {
        this.emit('missed', i, kind); // 라이프 유지, 콤보는 리셋
        this.resetCombo();
      } else {
        this.emit('missed', i, kind).lifeDelta = -1;
        this.resetCombo();
        this.loseLife();
        if (this._gameOver) return;
      }
    }

    if (this.isExpanding) return;
    this.spawner.timer -= h;
    if (this.spawner.timer <= 0) {
      if (this.trySpawn()) this.spawner.timer += this.spawner.interval(this._time);
      else this.spawner.timer = 0;
    }
  }

  private expand(): void {
    this._expanded = true;
    const n = cellCount(this._size);
    for (let i = 0; i < n; i++) {
      const o = this.cells[i] as CellObject;
      if (o.kind === null) continue;
      const kind = o.kind;
      this.removeObject(i);
      this.emit('cleared', i, kind);
    }
    this.cooldowns.fill(0);
    this._size = this.cfg.largeBoardSize;
    this.expandRemaining = this.cfg.expandPause;
    this.spawner.timer = 0; // 연출(1.5초)이 끝나면 바로 다음 출현 가능
    this.emit('boardExpand', -1, null);
  }

  private trySpawn(): boolean {
    const n = cellCount(this._size);
    if (this.active >= maxConcurrent(this._size, this._time, this.cfg)) return false;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if ((this.cells[i] as CellObject).kind === null && (this.cooldowns[i] as number) <= 0) this.free[count++] = i;
    }
    if (count === 0) return false;
    const kind = this.spawner.pickKind(this._time, this.goldenActive);
    const cell = this.spawner.pickCell(this.free, count);
    this.place(cell, kind, this.durationFor(kind));
    return true;
  }

  private durationFor(kind: ObjectKind): number {
    const base = exposureTime(this._time, this.cfg);
    if (kind === 'hard') return base * this.cfg.hardExposureMul;
    if (kind === 'golden') return base * this.cfg.goldenExposureMul;
    return base;
  }

  private place(cell: number, kind: ObjectKind, duration: number): void {
    const o = this.cells[cell] as CellObject;
    if (o.kind !== null) this.removeObject(cell, false);
    o.kind = kind;
    o.hp = kind === 'hard' ? this.cfg.hardHp : 1;
    o.duration = duration;
    o.remaining = duration;
    this.active++;
    if (kind === 'golden') this.goldenActive = true;
    this.emit('spawn', cell, kind);
  }

  private removeObject(cell: number, cooldown = true): void {
    const o = this.cells[cell] as CellObject;
    if (o.kind === 'golden') this.goldenActive = false;
    o.kind = null;
    o.hp = 0;
    o.remaining = 0;
    o.duration = 0;
    this.active--;
    if (cooldown) this.cooldowns[cell] = this.cfg.cellCooldown;
  }

  private catchBug(cell: number, kind: ObjectKind): void {
    const before = this.multiplier;
    this._combo++;
    if (this._combo > this._maxCombo) this._maxCombo = this._combo;
    this._bugsCaught++;
    const mult = this.multiplier;
    const base = kind === 'golden' ? this.cfg.scoreGolden : kind === 'hard' ? this.cfg.scoreHard : this.cfg.scoreBug;
    const points = base * mult;
    this._score += points;
    const gainLife = kind === 'golden' && this._lives < this.cfg.maxLives;
    const e = this.emit('caught', cell, kind);
    e.points = points;
    if (gainLife) {
      this._lives++;
      e.lives = this._lives;
      e.lifeDelta = 1;
    }
    if (mult > before) this.emit('multiplierUp', cell, null);
    if (gainLife) {
      const l = this.emit('lifeChanged', -1, null);
      l.lifeDelta = 1;
    }
  }

  private resetCombo(): void {
    if (this._combo > 0) {
      this.emit('comboReset', -1, null); // combo = 리셋 직전 값
      this._combo = 0;
    }
  }

  private loseLife(): void {
    this._lives--;
    this.emit('lifeChanged', -1, null).lifeDelta = -1;
    if (this._lives <= 0) {
      this._lives = 0;
      this._gameOver = true;
      this.emit('gameOver', -1, null);
    }
  }

  private emit(type: BugSquashEventType, cell: number, kind: ObjectKind | null): BugSquashEvent {
    const b = this.buf;
    const idx = Math.min(b.length, EVENT_CAPACITY - 1);
    const e = b.items[idx] as BugSquashEvent;
    if (b.length < EVENT_CAPACITY) b.length++;
    e.type = type;
    e.cell = cell;
    e.kind = kind;
    e.points = 0;
    e.multiplier = this.multiplier;
    e.combo = this._combo;
    e.lives = this._lives;
    e.lifeDelta = 0;
    return e;
  }
}
