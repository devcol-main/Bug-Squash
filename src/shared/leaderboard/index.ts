// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점). 온라인 리더보드는 2026-10-30 추가.
export type { LeaderboardEntry, LeaderboardService, LeaderboardSubmission, ScoreEntry } from './types';
export {
  LocalLeaderboardService,
  normalizeNickname,
  MAX_STORED,
  MAX_NICKNAME_LENGTH,
  DEFAULT_NICKNAME,
} from './LocalLeaderboardService';
export type { StorageLike, StatsSanitizer, LocalLeaderboardOptions } from './LocalLeaderboardService';
export { OnlineLeaderboardService, resolveLbEndpoint, DEFAULT_LB_ENDPOINT, LB_TIMEOUT_MS } from './OnlineLeaderboardService';
export type { OnlineIdentity, OnlineLeaderboardOptions, SubmitResult, DeleteResult, FetchLike } from './OnlineLeaderboardService';
export { NICKNAME_RULE_TEXT, NICKNAME_MIN, NICKNAME_MAX, cleanNickname, nicknameFormatOk, isFallbackName } from './nickname';
