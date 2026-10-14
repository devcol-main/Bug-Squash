import { LocalLeaderboardService, normalizeNickname, type StorageLike } from '../../../../shared/leaderboard';
import { LEGACY_NICKNAME_KEYS, PlayerProfile } from '../../../../shared/player';
import { UI_CONFIG } from './uiConfig';

export interface BugSquashStats {
  bugsCaught: number;
  maxCombo: number;
  survivalSec: number;
}

export const BUG_SQUASH_GAME_ID = 'bug-squash';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function sanitizeBugSquashStats(raw: unknown): BugSquashStats {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const src = (typeof r.stats === 'object' && r.stats !== null ? r.stats : r) as Record<string, unknown>;
  return { bugsCaught: num(src.bugsCaught), maxCombo: num(src.maxCombo), survivalSec: num(src.survivalSec) };
}

export function createBugSquashLeaderboard(storage?: StorageLike | null): LocalLeaderboardService<BugSquashStats> {
  return new LocalLeaderboardService<BugSquashStats>({
    gameId: BUG_SQUASH_GAME_ID,
    key: UI_CONFIG.leaderboardKey,
    sanitizeStats: sanitizeBugSquashStats,
    storage,
  });
}

/** 공통 프로필. 공통 닉네임이 없으면 옛 게임별 닉네임을 한 번 가져온다(이 게임 것을 먼저). */
export function createPlayerProfile(storage?: StorageLike | null): PlayerProfile {
  return new PlayerProfile({ storage, legacyNicknameKeys: LEGACY_NICKNAME_KEYS });
}

/** 제출용 stats. 생존 시간은 초 단위. */
export function makeStats(r: { bugsCaught: number; maxCombo: number; time: number }): BugSquashStats {
  return { bugsCaught: r.bugsCaught, maxCombo: r.maxCombo, survivalSec: r.time };
}

/** 제출할 닉네임. 입력칸이 비어 있으면 공통 프로필 닉네임을 쓴다(Reset 등으로 비어도 닉네임이 Anonymous로 덮이지 않게). */
export function nicknameToSubmit(input: string, profileNickname: string): string {
  return normalizeNickname(input.trim() ? input : profileNickname);
}
