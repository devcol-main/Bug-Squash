// devcol.net 공용 온라인 리더보드 (a.devcol.net/lb, 서버는 devcol-analytics 리포).
// 로그인 없음: 첫 제출 때 서버가 준 토큰을 PlayerProfile에 보관한다. playerId는 서버로 보내지 않는다.
// 항상 로컬에 먼저 저장하고, 서버가 안 되면(오프라인, 시간 초과, 오류) 로컬 기록으로 동작한다.
import type { LeaderboardService, LeaderboardSubmission, ScoreEntry } from './types';
import type { StatsSanitizer } from './LocalLeaderboardService';
import { normalizeNickname } from './LocalLeaderboardService';

export const DEFAULT_LB_ENDPOINT = 'https://a.devcol.net/lb';
export const LB_TIMEOUT_MS = 4000;
const SITE_HOSTS = ['devcol.net', 'www.devcol.net'];

/** 온라인 소유 정보 저장소. PlayerProfile이 이 형태를 갖는다 (shared/player를 import하면 순환이 생겨서 형태만 둔다). */
export interface OnlineIdentity {
  readonly token: string | null;
  setToken(token: string | null): void;
  ownEntryId(gameId: string): number | null;
  setOwnEntryId(gameId: string, entryId: number): void;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * 어느 서버로 보낼지. override(페이지의 data-lb-endpoint 등)가 있으면 그것,
 * devcol.net에서 열렸으면 기본 서버, 그 밖(로컬 dev 등)은 null = 로컬 전용.
 */
export function resolveLbEndpoint(hostname: string, override?: string | null): string | null {
  if (override && /^https?:\/\//.test(override)) return override.replace(/\/+$/, '');
  return SITE_HOSTS.includes(hostname) ? DEFAULT_LB_ENDPOINT : null;
}

export interface SubmitResult {
  entryId: number;
  publishedName: string;
  nameStatus: string;
  best: number;
  rank: number | null;
}

export type DeleteResult = 'deleted' | 'none' | 'failed';

export interface OnlineLeaderboardOptions<TStats> {
  gameId: string;
  /** 항상 먼저 저장하고, 서버가 안 될 때 읽는 로컬 리더보드. */
  local: LeaderboardService<TStats>;
  identity: OnlineIdentity;
  sanitizeStats: StatsSanitizer<TStats>;
  /** null이면 서버를 쓰지 않는다 (로컬 전용). */
  endpoint: string | null;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** stats에서 숫자 값만 서버로 보낸다. */
function wireStats(stats: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof stats !== 'object' || stats === null) return out;
  for (const [k, v] of Object.entries(stats as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export class OnlineLeaderboardService<TStats> implements LeaderboardService<TStats> {
  readonly gameId: string;
  /** 마지막 getTop이 서버('online')에서 왔는지 로컬('local')에서 왔는지. UI의 "Offline" 표시용. */
  lastSource: 'online' | 'local' = 'local';
  /** 마지막 submit의 서버 결과. 서버에 못 보냈으면 null. */
  lastResult: SubmitResult | null = null;
  private readonly local: LeaderboardService<TStats>;
  private readonly identity: OnlineIdentity;
  private readonly sanitizeStats: StatsSanitizer<TStats>;
  private readonly endpoint: string | null;
  private readonly fetchFn: FetchLike | null;
  private readonly timeoutMs: number;

  constructor(opts: OnlineLeaderboardOptions<TStats>) {
    this.gameId = opts.gameId;
    this.local = opts.local;
    this.identity = opts.identity;
    this.sanitizeStats = opts.sanitizeStats;
    this.endpoint = opts.endpoint;
    this.timeoutMs = opts.timeoutMs ?? LB_TIMEOUT_MS;
    const f = opts.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    this.fetchFn = f;
  }

  /** 서버를 쓸 수 있는 설정인지 (엔드포인트와 fetch가 있음). */
  get online(): boolean {
    return this.endpoint !== null && this.fetchFn !== null;
  }

  /** 시간 제한이 있는 요청. 실패/시간 초과면 null. */
  private async request(path: string, init?: RequestInit): Promise<Response | null> {
    if (!this.endpoint || !this.fetchFn) return null;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ctrl?.abort();
        resolve(null);
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.fetchFn(this.endpoint + path, { ...init, signal: ctrl?.signal }), timeout]);
    } catch {
      return null;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  /** JSON을 text/plain으로 보낸다 (CORS preflight 없이). */
  private post(path: string, body: unknown): Promise<Response | null> {
    return this.request(path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  }

  async submit(entry: LeaderboardSubmission<TStats>): Promise<void> {
    this.lastResult = null;
    await this.local.submit(entry);
    if (!this.online) return;
    const body: Record<string, unknown> = {
      game: this.gameId,
      name: normalizeNickname(entry.nickname),
      score: entry.score,
      stats: wireStats(entry.stats),
      durationMs: typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : 0,
    };
    const token = this.identity.token;
    if (token) body.token = token;
    const res = await this.post('/submit', body);
    if (!res || !res.ok) return;
    try {
      const d = (await res.json()) as Record<string, unknown>;
      if (typeof d.token === 'string') this.identity.setToken(d.token);
      if (typeof d.entryId !== 'number') return;
      this.identity.setOwnEntryId(this.gameId, d.entryId);
      this.lastResult = {
        entryId: d.entryId,
        publishedName: typeof d.publishedName === 'string' ? d.publishedName : '',
        nameStatus: typeof d.nameStatus === 'string' ? d.nameStatus : '',
        best: typeof d.best === 'number' ? d.best : entry.score,
        rank: typeof d.rank === 'number' ? d.rank : null,
      };
    } catch {
      // 응답이 깨졌으면 로컬 기록만 남는다
    }
  }

  async getTop(n: number): Promise<ScoreEntry<TStats>[]> {
    const count = Math.max(0, Math.floor(n));
    const res = await this.request(`/top?game=${encodeURIComponent(this.gameId)}&n=${count}`);
    if (res && res.ok) {
      try {
        const d = (await res.json()) as { entries?: unknown };
        if (Array.isArray(d.entries)) {
          const list: ScoreEntry<TStats>[] = [];
          for (const raw of d.entries) {
            const r = (raw ?? {}) as Record<string, unknown>;
            if (typeof r.id !== 'number' || typeof r.name !== 'string' || typeof r.score !== 'number') continue;
            list.push({
              playerId: '',
              nickname: r.name,
              score: r.score,
              stats: this.sanitizeStats(r.stats),
              ts: typeof r.ts === 'number' ? r.ts : 0,
              entryId: r.id,
            });
          }
          this.lastSource = 'online';
          return list.slice(0, count);
        }
      } catch {
        // 아래 로컬 폴백
      }
    }
    this.lastSource = 'local';
    return this.local.getTop(count);
  }

  /** 서버 순위표의 이 줄이 내 기록인지 (entryId로 비교). */
  isMine(entry: ScoreEntry<TStats>): boolean {
    return entry.entryId !== undefined && entry.entryId === this.identity.ownEntryId(this.gameId);
  }

  /**
   * 내 온라인 기록을 모든 게임에서 지우고 토큰도 버린다. 이 기기의 로컬 기록은 그대로.
   * 토큰이 없거나 서버가 모르는 토큰이면 'none'.
   */
  async deleteMine(): Promise<DeleteResult> {
    const token = this.identity.token;
    if (!token) return 'none';
    const res = await this.post('/delete', { token });
    if (!res) return 'failed';
    if (res.status === 404) {
      this.identity.setToken(null);
      return 'none';
    }
    if (!res.ok) return 'failed';
    this.identity.setToken(null);
    return 'deleted';
  }

  /** 다른 사람의 이름을 신고한다. 서버가 받으면 true. */
  async report(entryId: number): Promise<boolean> {
    const res = await this.post('/report', { entryId });
    return res !== null && res.ok;
  }
}
