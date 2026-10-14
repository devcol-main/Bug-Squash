// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
/**
 * 리더보드 엔트리. stats는 게임마다 다른 보조 값(제네릭).
 * playerId가 ''이면 playerId가 생기기 전의 옛 기록(알 수 없음)이다.
 */
export interface ScoreEntry<TStats> {
  playerId: string;
  nickname: string;
  score: number;
  stats: TStats;
  /** 제출 시각 (epoch ms) */
  ts: number;
}

/** UI처럼 stats 내용을 모르는 곳에서 쓰는 별칭. */
export type LeaderboardEntry<TStats = unknown> = ScoreEntry<TStats>;

/** 제출용 입력. ts는 생략하면 서비스가 채운다. */
export type LeaderboardSubmission<TStats> = Omit<ScoreEntry<TStats>, 'ts'> & { ts?: number };

/** 게임은 이 인터페이스로만 리더보드에 접근한다. 나중에 서버 구현으로 교체 가능. */
export interface LeaderboardService<TStats> {
  readonly gameId: string;
  submit(entry: LeaderboardSubmission<TStats>): Promise<void>;
  getTop(n: number): Promise<ScoreEntry<TStats>[]>;
}
