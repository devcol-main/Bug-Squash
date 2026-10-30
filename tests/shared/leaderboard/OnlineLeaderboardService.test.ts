import { describe, expect, it, vi } from 'vitest';
import { LocalLeaderboardService, type StorageLike } from '../../../src/shared/leaderboard/LocalLeaderboardService';
import {
  DEFAULT_LB_ENDPOINT,
  OnlineLeaderboardService,
  resolveLbEndpoint,
  type FetchLike,
  type OnlineIdentity,
} from '../../../src/shared/leaderboard/OnlineLeaderboardService';

interface Stats {
  floors: number;
  maxCombo: number;
}
const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sanitize = (raw: unknown): Stats => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { floors: n0(r.floors), maxCombo: n0(r.maxCombo) };
};

function memStorage(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

function identity(initial: string | null = null): OnlineIdentity & { ids: Record<string, number> } {
  const ids: Record<string, number> = {};
  let token = initial;
  return {
    ids,
    get token() {
      return token;
    },
    setToken(t) {
      token = t;
      if (!t) for (const k of Object.keys(ids)) delete ids[k];
    },
    ownEntryId: (g) => ids[g] ?? null,
    setOwnEntryId: (g, id) => void (ids[g] = id),
  };
}

const TOKEN = 'cd'.repeat(32);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

interface Call {
  url: string;
  init?: RequestInit;
}
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as FetchLike & { calls: Call[] };
  f.calls = calls;
  return f;
}

function svc(fetch: FetchLike | undefined, id = identity(), endpoint: string | null = DEFAULT_LB_ENDPOINT, timeoutMs?: number) {
  const local = new LocalLeaderboardService<Stats>({ gameId: 'stack-up', key: 'lb', sanitizeStats: sanitize, storage: memStorage(), now: () => 1000 });
  const online = new OnlineLeaderboardService<Stats>({ gameId: 'stack-up', local, identity: id, sanitizeStats: sanitize, endpoint, fetch, timeoutMs });
  return { local, online, id };
}

const entry = (over: Record<string, unknown> = {}) => ({
  playerId: 'local-player-id',
  nickname: 'Kim',
  score: 120,
  stats: { floors: 12, maxCombo: 3 },
  durationMs: 61_234.4,
  ...over,
});

describe('resolveLbEndpoint', () => {
  it('devcol.net and www → default server; other hosts → local only; override wins', () => {
    expect(resolveLbEndpoint('devcol.net')).toBe(DEFAULT_LB_ENDPOINT);
    expect(resolveLbEndpoint('www.devcol.net')).toBe(DEFAULT_LB_ENDPOINT);
    expect(resolveLbEndpoint('localhost')).toBeNull();
    expect(resolveLbEndpoint('evil.example')).toBeNull();
    expect(resolveLbEndpoint('localhost', 'http://localhost:8787/lb/')).toBe('http://localhost:8787/lb');
    expect(resolveLbEndpoint('devcol.net', 'javascript:alert(1)')).toBe(DEFAULT_LB_ENDPOINT);
  });
});

describe('OnlineLeaderboardService.submit', () => {
  it('online ok → saved locally and remotely, token and own entry id stored, no playerId sent', async () => {
    const f = fakeFetch(() => json({ entryId: 7, publishedName: 'Kim', nameStatus: 'ok', best: 120, rank: 3, token: TOKEN }));
    const { local, online, id } = svc(f);
    await online.submit(entry());
    expect(await local.getTop(10)).toHaveLength(1);
    expect(f.calls[0]!.url).toBe(`${DEFAULT_LB_ENDPOINT}/submit`);
    expect(f.calls[0]!.init?.method).toBe('POST');
    expect(new Headers(f.calls[0]!.init?.headers).get('Content-Type')).toBe('text/plain');
    const body = JSON.parse(String(f.calls[0]!.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ game: 'stack-up', name: 'Kim', score: 120, stats: { floors: 12, maxCombo: 3 }, durationMs: 61234 });
    expect(JSON.stringify(body)).not.toContain('local-player-id');
    expect(id.token).toBe(TOKEN);
    expect(id.ownEntryId('stack-up')).toBe(7);
    expect(online.lastResult).toEqual({ entryId: 7, publishedName: 'Kim', nameStatus: 'ok', best: 120, rank: 3 });
  });

  it('existing token is sent with the submit and kept when the reply has none', async () => {
    const f = fakeFetch(() => json({ entryId: 7, publishedName: 'Player0421', nameStatus: 'rules_fallback', best: 120, rank: 1 }));
    const { online, id } = svc(f, identity(TOKEN));
    await online.submit(entry());
    expect(JSON.parse(String(f.calls[0]!.init?.body))).toMatchObject({ token: TOKEN });
    expect(id.token).toBe(TOKEN);
    expect(online.lastResult?.publishedName).toBe('Player0421');
  });

  it('server error or network failure → local only, no throw, lastResult null', async () => {
    for (const f of [fakeFetch(() => json({ error: 'out_of_bounds' }, 422)), fakeFetch(() => Promise.reject(new Error('offline')))]) {
      const { local, online, id } = svc(f);
      await expect(online.submit(entry())).resolves.toBeUndefined();
      expect(await local.getTop(10)).toHaveLength(1);
      expect(online.lastResult).toBeNull();
      expect(id.token).toBeNull();
    }
  });

  it('server slower than the timeout → gives up and keeps the local record', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeFetch(() => new Promise<Response>(() => {}));
      const { local, online } = svc(f, identity(), DEFAULT_LB_ENDPOINT, 4000);
      const p = online.submit(entry());
      await vi.advanceTimersByTimeAsync(4000);
      await p;
      expect(online.lastResult).toBeNull();
      expect(f.calls[0]!.init?.signal?.aborted).toBe(true);
      expect(await local.getTop(10)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no endpoint (local dev) → never calls fetch', async () => {
    const f = fakeFetch(() => json({}));
    const { local, online } = svc(f, identity(), null);
    await online.submit(entry());
    await online.getTop(10);
    expect(f.calls).toEqual([]);
    expect(online.lastSource).toBe('local');
    expect(await local.getTop(10)).toHaveLength(1);
  });
});

describe('OnlineLeaderboardService.getTop', () => {
  it('online → server rows mapped with entryId, lastSource online', async () => {
    const f = fakeFetch(() =>
      json({ game: 'stack-up', entries: [{ id: 3, name: 'Ann', score: 50, stats: { floors: 5 }, ts: 9 }, { bogus: true }] }),
    );
    const { online, id } = svc(f);
    const rows = await online.getTop(10);
    expect(f.calls[0]!.url).toBe(`${DEFAULT_LB_ENDPOINT}/top?game=stack-up&n=10`);
    expect(rows).toEqual([{ playerId: '', nickname: 'Ann', score: 50, stats: { floors: 5, maxCombo: 0 }, ts: 9, entryId: 3 }]);
    expect(online.lastSource).toBe('online');
    expect(online.isMine(rows[0]!)).toBe(false);
    id.setOwnEntryId('stack-up', 3);
    expect(online.isMine(rows[0]!)).toBe(true);
  });

  it('server down or junk reply → local records, lastSource local', async () => {
    for (const f of [fakeFetch(() => json({}, 500)), fakeFetch(() => new Response('<html>')), fakeFetch(() => Promise.reject(new Error('x')))]) {
      const { local, online } = svc(f);
      await local.submit(entry({ nickname: 'Local' }));
      const rows = await online.getTop(10);
      expect(rows.map((r) => r.nickname)).toEqual(['Local']);
      expect(online.lastSource).toBe('local');
      expect(online.isMine(rows[0]!)).toBe(false);
    }
  });
});

describe('OnlineLeaderboardService.deleteMine / report', () => {
  it('delete with a token → POST /delete, token and own ids cleared', async () => {
    const f = fakeFetch(() => json({ deleted: 2 }));
    const id = identity(TOKEN);
    id.setOwnEntryId('stack-up', 7);
    const { online } = svc(f, id);
    expect(await online.deleteMine()).toBe('deleted');
    expect(JSON.parse(String(f.calls[0]!.init?.body))).toEqual({ token: TOKEN });
    expect(f.calls[0]!.url).toBe(`${DEFAULT_LB_ENDPOINT}/delete`);
    expect(id.token).toBeNull();
    expect(id.ownEntryId('stack-up')).toBeNull();
  });

  it('no token → none without a request; unknown token (404) → none and the dead token is dropped', async () => {
    const f = fakeFetch(() => json({ error: 'not_found' }, 404));
    expect(await svc(f).online.deleteMine()).toBe('none');
    expect(f.calls).toEqual([]);
    const id = identity(TOKEN);
    expect(await svc(f, id).online.deleteMine()).toBe('none');
    expect(id.token).toBeNull();
  });

  it('server error → failed and the token is kept for a retry', async () => {
    const id = identity(TOKEN);
    expect(await svc(fakeFetch(() => json({}, 500)), id).online.deleteMine()).toBe('failed');
    expect(await svc(fakeFetch(() => Promise.reject(new Error('x'))), id).online.deleteMine()).toBe('failed');
    expect(id.token).toBe(TOKEN);
  });

  it('report → POST /report with the entry id; true only when accepted', async () => {
    const ok = fakeFetch(() => json({ ok: true }));
    expect(await svc(ok).online.report(3)).toBe(true);
    expect(JSON.parse(String(ok.calls[0]!.init?.body))).toEqual({ entryId: 3 });
    expect(await svc(fakeFetch(() => json({ error: 'rate_limited' }, 429))).online.report(3)).toBe(false);
    expect(await svc(fakeFetch(() => json({}))).online.report(3)).toBe(true);
    expect(await svc(undefined, identity(), null).online.report(3)).toBe(false);
  });
});
