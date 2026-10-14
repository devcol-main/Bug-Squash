// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
import type { LeaderboardService, LeaderboardSubmission, ScoreEntry } from './types';

/** localStorage 유사 객체 (테스트 주입용). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MAX_STORED = 50;
export const MAX_NICKNAME_LENGTH = 12;
export const DEFAULT_NICKNAME = 'Anonymous';

export function normalizeNickname(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, MAX_NICKNAME_LENGTH).trim() : '';
  return s || DEFAULT_NICKNAME;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 게임이 제공하는 stats 정리 함수. 알 수 없는 값이 들어와도 항상 유효한 stats를 돌려줘야 한다.
 * 옛 형식 레코드(최상위에 floors/maxCombo)가 들어오면 레코드 전체가 넘어온다. 예: `r.stats ?? r`.
 */
export type StatsSanitizer<TStats> = (raw: unknown) => TStats;

export interface LocalLeaderboardOptions<TStats> {
  gameId: string;
  /** localStorage 키 (게임별로 따로). */
  key: string;
  sanitizeStats: StatsSanitizer<TStats>;
  /** 생략하면 globalThis.localStorage, null이면 스토리지 없음(메모리만). */
  storage?: StorageLike | null;
  now?: () => number;
}

/** 점수 내림차순, 동점이면 먼저 제출한 쪽(ts, 이후 저장 순서)이 위. */
function compare<T>(a: ScoreEntry<T>, b: ScoreEntry<T>): number {
  return b.score - a.score || a.ts - b.ts;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

export class LocalLeaderboardService<TStats> implements LeaderboardService<TStats> {
  readonly gameId: string;
  private memory: ScoreEntry<TStats>[] = [];
  /** 쓰기에 실패한 적이 있으면 memory가 진실의 원천이다. */
  private writeFailed = false;
  private readonly storage: StorageLike | undefined;
  private readonly key: string;
  private readonly sanitizeStats: StatsSanitizer<TStats>;
  private readonly now: () => number;

  constructor(opts: LocalLeaderboardOptions<TStats>) {
    this.gameId = opts.gameId;
    this.key = opts.key;
    this.sanitizeStats = opts.sanitizeStats;
    this.now = opts.now ?? Date.now;
    this.storage = opts.storage === null ? undefined : (opts.storage ?? defaultStorage());
  }

  async submit(entry: LeaderboardSubmission<TStats>): Promise<void> {
    const ts = typeof entry.ts === 'number' && Number.isFinite(entry.ts) ? entry.ts : this.now();
    const clean: ScoreEntry<TStats> = {
      playerId: typeof entry.playerId === 'string' ? entry.playerId : '',
      nickname: normalizeNickname(entry.nickname),
      score: num(entry.score),
      stats: this.sanitizeStats(entry.stats),
      ts,
    };
    // Array.prototype.sort는 안정 정렬이라 같은 ts여도 저장 순서가 유지된다.
    const list = [...this.load(), clean].sort(compare).slice(0, MAX_STORED);
    this.save(list);
  }

  async getTop(n: number): Promise<ScoreEntry<TStats>[]> {
    const count = Math.max(0, Math.floor(n));
    return this.load().sort(compare).slice(0, count);
  }

  /**
   * 저장된 레코드 하나를 정리한다.
   * 옛 형식(stats 없음, floors/maxCombo가 최상위, playerId 없음)이면 레코드 자체를 sanitizeStats에 넘겨 stats를 만들고
   * playerId는 ''(알 수 없음)로 둔다.
   */
  private sanitize(raw: unknown): ScoreEntry<TStats> | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
    const hasStats = typeof r.stats === 'object' && r.stats !== null;
    return {
      playerId: typeof r.playerId === 'string' ? r.playerId : '',
      nickname: normalizeNickname(r.nickname),
      score: r.score,
      stats: this.sanitizeStats(hasStats ? r.stats : r),
      ts: num(r.ts),
    };
  }

  /** 부작용 없이 현재 목록의 복사본을 돌려준다. */
  private load(): ScoreEntry<TStats>[] {
    if (this.writeFailed) return [...this.memory];
    const stored = this.readStorage();
    return stored ?? [...this.memory];
  }

  /** 스토리지에서 읽는다. 사용 불가(없음/throw)면 null, 손상/없는 값이면 []. */
  private readStorage(): ScoreEntry<TStats>[] | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(this.key);
      if (typeof raw !== 'string') return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const list: ScoreEntry<TStats>[] = [];
      for (const item of parsed) {
        const e = this.sanitize(item);
        if (e) list.push(e);
      }
      return list;
    } catch {
      // 접근 불가 또는 손상된 JSON
      return null;
    }
  }

  private save(list: ScoreEntry<TStats>[]): void {
    this.memory = list;
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(list));
    } catch {
      // 쓰기 실패: 이후에는 memory를 기준으로 동작한다.
      this.writeFailed = true;
    }
  }
}
