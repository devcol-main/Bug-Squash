import {
  LocalLeaderboardService,
  OnlineLeaderboardService,
  isFallbackName,
  normalizeNickname,
  type LeaderboardEntry,
  type StorageLike,
  type SubmitResult,
} from '../shared/leaderboard';
import { LEGACY_NICKNAME_KEYS, PlayerProfile } from '../shared/player';
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

/**
 * 온라인 리더보드 (로컬 리더보드를 감싼다). endpoint가 null이면(로컬 dev 등) 로컬 전용으로 동작한다.
 * Reset data 후에는 새로 만들어 로컬 메모리 값도 비운다.
 */
export function createBugSquashOnlineLeaderboard(
  profile: PlayerProfile,
  endpoint: string | null,
  storage?: StorageLike | null,
): OnlineLeaderboardService<BugSquashStats> {
  return new OnlineLeaderboardService<BugSquashStats>({
    gameId: BUG_SQUASH_GAME_ID,
    local: createBugSquashLeaderboard(storage),
    identity: profile,
    sanitizeStats: sanitizeBugSquashStats,
    endpoint,
  });
}

/** 로컬 순위표에서 방금 제출한 내 기록인지 (온라인 항목 id가 없으므로 닉네임/점수/ts로 비교). */
export function sameLocalEntry(e: LeaderboardEntry, mine: LeaderboardEntry | null): boolean {
  return mine !== null && e.ts === mine.ts && e.score === mine.score && e.nickname === mine.nickname;
}

/** 서버가 입력한 이름을 그대로 공개한 상태 */
const NAME_KEPT: readonly string[] = ['ok', 'unchecked_ai'];

/**
 * 순위표 위 안내 문구. 서버를 쓰는 설정인데 로컬 기록을 보여주면 오프라인 안내,
 * 방금 제출한 이름이 Player####로 바뀌었으면 그 사실을 알린다. 그 밖에는 null.
 */
export function boardNote(
  online: boolean,
  source: 'online' | 'local',
  submitted: Pick<SubmitResult, 'publishedName' | 'nameStatus'> | null,
): string | null {
  if (online && source === 'local') return 'Offline: showing scores on this device';
  if (submitted && !NAME_KEPT.includes(submitted.nameStatus) && isFallbackName(submitted.publishedName)) {
    return `Your name is shown as ${submitted.publishedName}.`;
  }
  return null;
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
