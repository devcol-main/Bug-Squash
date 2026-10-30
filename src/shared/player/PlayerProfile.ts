// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
// 게임 간 공통 플레이어 프로필. core가 아니므로 Math.random / crypto를 써도 된다.
import { MAX_NICKNAME_LENGTH } from '../leaderboard';

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const PLAYER_ID_KEY = 'devcol.player.id';
export const PLAYER_NICKNAME_KEY = 'devcol.player.nickname';
/** 온라인 리더보드 소유 토큰 (서버가 첫 제출 때 발급). 내 기록 삭제에 필요하다. playerId는 서버로 보내지 않는다. */
export const PLAYER_TOKEN_KEY = 'devcol.player.token';
/** 온라인 리더보드의 내 항목 id, 게임별 {gameId: entryId}. 순위표에서 내 줄 표시용. */
export const PLAYER_LB_ENTRIES_KEY = 'devcol.player.lbEntries';
/** 옛 게임별 닉네임 키. Stack Up이 더 오래된 게임이고 기존 리더보드 기록과 이름이 맞으므로 먼저 본다. */
export const LEGACY_NICKNAME_KEYS: readonly string[] = ['stackup.nickname', 'bugSquash.nickname'];

export interface PlayerProfileOptions {
  /** 생략하면 globalThis.localStorage, null이면 스토리지 없음(세션 메모리만). */
  storage?: ProfileStorage | null;
  /** 공통 닉네임이 없을 때 한 번 가져올 옛 게임별 키. 앞에서부터 처음 찾은 값을 쓴다. */
  legacyNicknameKeys?: readonly string[];
  maxNicknameLength?: number;
  /** 테스트용 id 생성기. */
  generateId?: () => string;
}

export function generatePlayerId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // 폴백으로 진행
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function defaultStorage(): ProfileStorage | undefined {
  try {
    return (globalThis as { localStorage?: ProfileStorage }).localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export class PlayerProfile {
  private readonly storage: ProfileStorage | undefined;
  private readonly legacyKeys: readonly string[];
  private readonly maxLen: number;
  private readonly generateId: () => string;
  private id: string | null = null;
  private nick: string | null = null;
  /** undefined = 아직 안 읽음 */
  private tok: string | null | undefined = undefined;
  private entries: Record<string, number> | null = null;

  constructor(opts: PlayerProfileOptions = {}) {
    this.storage = opts.storage === null ? undefined : (opts.storage ?? defaultStorage());
    this.legacyKeys = opts.legacyNicknameKeys ?? [];
    this.maxLen = opts.maxNicknameLength ?? MAX_NICKNAME_LENGTH;
    this.generateId = opts.generateId ?? generatePlayerId;
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // 저장 불가: 세션 메모리 값만 유지
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem?.(key);
    } catch {
      // 저장 불가: 세션 메모리 값만 유지
    }
  }

  /** 처음 접근할 때 한 번 만들어 저장하고 이후 계속 같은 값을 돌려준다. 저장 불가면 세션 동안만 유지. */
  get playerId(): string {
    if (this.id !== null) return this.id;
    const stored = this.read(PLAYER_ID_KEY);
    if (stored) {
      this.id = stored;
    } else {
      this.id = this.generateId();
      this.write(PLAYER_ID_KEY, this.id);
    }
    return this.id;
  }

  /** 공통 닉네임. 없으면 레거시 키에서 처음 찾은 값을 한 번 가져와 공통 키에 저장한다. 없으면 ''. */
  get nickname(): string {
    if (this.nick !== null) return this.nick;
    const own = this.read(PLAYER_NICKNAME_KEY);
    if (own) {
      this.nick = own.slice(0, this.maxLen);
      return this.nick;
    }
    let found = '';
    for (const k of this.legacyKeys) {
      const v = this.read(k)?.slice(0, this.maxLen) ?? '';
      if (v.trim()) {
        found = v;
        break;
      }
    }
    this.nick = found;
    if (found) this.write(PLAYER_NICKNAME_KEY, found);
    return this.nick;
  }

  setNickname(nick: string): void {
    this.nick = nick.slice(0, this.maxLen);
    this.write(PLAYER_NICKNAME_KEY, this.nick);
  }

  /** 온라인 리더보드 토큰. 없으면 null. */
  get token(): string | null {
    if (this.tok !== undefined) return this.tok;
    const v = this.read(PLAYER_TOKEN_KEY);
    this.tok = v && /^[0-9a-f]{64}$/.test(v) ? v : null;
    return this.tok;
  }

  /** null이면 토큰과 내 항목 id를 모두 지운다 (서버에서 삭제했거나 토큰이 더는 유효하지 않을 때). */
  setToken(token: string | null): void {
    this.tok = token;
    if (token) {
      this.write(PLAYER_TOKEN_KEY, token);
      return;
    }
    this.remove(PLAYER_TOKEN_KEY);
    this.entries = {};
    this.remove(PLAYER_LB_ENTRIES_KEY);
  }

  private loadEntries(): Record<string, number> {
    if (this.entries) return this.entries;
    const out: Record<string, number> = {};
    try {
      const parsed: unknown = JSON.parse(this.read(PLAYER_LB_ENTRIES_KEY) ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isInteger(v)) out[k] = v;
        }
      }
    } catch {
      // 손상된 값: 비운다
    }
    this.entries = out;
    return out;
  }

  /** 이 게임의 내 온라인 항목 id. 없으면 null. */
  ownEntryId(gameId: string): number | null {
    return this.loadEntries()[gameId] ?? null;
  }

  setOwnEntryId(gameId: string, entryId: number): void {
    const e = this.loadEntries();
    e[gameId] = entryId;
    this.write(PLAYER_LB_ENTRIES_KEY, JSON.stringify(e));
  }
}
