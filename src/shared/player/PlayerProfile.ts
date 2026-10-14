// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
// 게임 간 공통 플레이어 프로필. core가 아니므로 Math.random / crypto를 써도 된다.
import { MAX_NICKNAME_LENGTH } from '../leaderboard';

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PLAYER_ID_KEY = 'devcol.player.id';
export const PLAYER_NICKNAME_KEY = 'devcol.player.nickname';
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
}
