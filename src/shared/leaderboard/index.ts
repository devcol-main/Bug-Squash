// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
export type { LeaderboardEntry, LeaderboardService, LeaderboardSubmission, ScoreEntry } from './types';
export {
  LocalLeaderboardService,
  normalizeNickname,
  MAX_STORED,
  MAX_NICKNAME_LENGTH,
  DEFAULT_NICKNAME,
} from './LocalLeaderboardService';
export type { StorageLike, StatsSanitizer, LocalLeaderboardOptions } from './LocalLeaderboardService';
