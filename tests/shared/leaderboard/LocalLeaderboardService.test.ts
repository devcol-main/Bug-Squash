// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
import { describe, expect, it, vi, afterEach } from 'vitest';
import { LocalLeaderboardService, MAX_STORED, type StorageLike } from '../../../src/shared/leaderboard/LocalLeaderboardService';

interface SuStats {
  floors: number;
  maxCombo: number;
}
const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// 테스트용 sanitize: 서비스가 stats 객체 또는 옛 레코드 전체를 넘겨주므로 둘 다 floors/maxCombo를 직접 읽는다.
const sanitizeSu = (raw: unknown): SuStats => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { floors: n0(r.floors), maxCombo: n0(r.maxCombo) };
};
function svc(key: string, storage?: StorageLike | null, now?: () => number): LocalLeaderboardService<SuStats> {
  return new LocalLeaderboardService<SuStats>({ gameId: 'stack-up', key, sanitizeStats: sanitizeSu, storage, now });
}

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? (data[k] as string) : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const e = (nickname: string, score: number, ts?: number) => ({ playerId: 'p', nickname, score, stats: { floors: 1, maxCombo: 2 }, ts });

describe('LocalLeaderboardService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submitted entry is returned by getTop with all fields', async () => {
    const s = svc('k', memStorage(), () => 777);
    await s.submit({ playerId: 'pid', nickname: 'Ann', score: 10, stats: { floors: 5, maxCombo: 3 } });
    expect(await s.getTop(10)).toEqual([{ playerId: 'pid', nickname: 'Ann', score: 10, stats: { floors: 5, maxCombo: 3 }, ts: 777 }]);
  });

  it('entries persist across service instances sharing the same storage key', async () => {
    const st = memStorage();
    await svc('k', st).submit(e('A', 5, 1));
    expect(await svc('k', st).getTop(5)).toHaveLength(1);
    expect(await svc('other', st).getTop(5)).toHaveLength(0);
  });

  it('getTop sorts by score descending', async () => {
    const s = svc('k', memStorage());
    await s.submit(e('a', 5, 1));
    await s.submit(e('b', 50, 2));
    await s.submit(e('c', 20, 3));
    expect((await s.getTop(10)).map((x) => x.nickname)).toEqual(['b', 'c', 'a']);
  });

  it('tied scores rank the earlier submission first', async () => {
    const s = svc('k', memStorage());
    await s.submit(e('late', 10, 200));
    await s.submit(e('early', 10, 100));
    expect((await s.getTop(10)).map((x) => x.nickname)).toEqual(['early', 'late']);
  });

  it('tied scores with identical ts keep submission order', async () => {
    const s = svc('k', memStorage());
    await s.submit(e('first', 10, 100));
    await s.submit(e('second', 10, 100));
    expect((await s.getTop(10)).map((x) => x.nickname)).toEqual(['first', 'second']);
  });

  it('getTop(n) returns at most n entries', async () => {
    const s = svc('k', memStorage());
    for (let i = 0; i < 5; i++) await s.submit(e('a', i, i));
    expect(await s.getTop(3)).toHaveLength(3);
    expect(await s.getTop(0)).toHaveLength(0);
  });

  it('stored list is capped and keeps only the best entries', async () => {
    const st = memStorage();
    const s = svc('k', st);
    for (let i = 0; i < MAX_STORED + 10; i++) await s.submit(e('a', i, i));
    const stored = JSON.parse(st.data.k as string) as { score: number }[];
    expect(stored).toHaveLength(MAX_STORED);
    expect(Math.min(...stored.map((x) => x.score))).toBe(10);
    expect(Math.max(...stored.map((x) => x.score))).toBe(MAX_STORED + 9);
    expect((await s.getTop(1))[0]?.score).toBe(MAX_STORED + 9);
  });

  it('nickname is trimmed and truncated to 12 characters', async () => {
    const s = svc('k', memStorage());
    await s.submit(e('   Bob   ', 1, 1));
    await s.submit(e('ABCDEFGHIJKLMNOP', 0, 2));
    const top = await s.getTop(5);
    expect(top[0]?.nickname).toBe('Bob');
    expect(top[1]?.nickname).toBe('ABCDEFGHIJKL');
  });

  it('empty or whitespace nickname becomes Anonymous', async () => {
    const s = svc('k', memStorage());
    await s.submit(e('', 2, 1));
    await s.submit(e('   ', 1, 2));
    expect((await s.getTop(5)).map((x) => x.nickname)).toEqual(['Anonymous', 'Anonymous']);
  });

  it('storage that throws on every access falls back to memory without errors', async () => {
    const bad: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s = svc('k', bad);
    await s.submit(e('a', 1, 1));
    await s.submit(e('b', 2, 2));
    expect((await s.getTop(5)).map((x) => x.nickname)).toEqual(['b', 'a']);
  });

  it('explicit null storage works with memory fallback', async () => {
    const s = svc('k', null);
    await s.submit(e('a', 1, 1));
    expect(await s.getTop(5)).toHaveLength(1);
  });

  it('global localStorage being undefined works with memory fallback', async () => {
    vi.stubGlobal('localStorage', undefined);
    const s = svc('k');
    await s.submit(e('a', 1, 1));
    await s.submit(e('b', 2, 2));
    expect((await s.getTop(5)).map((x) => x.nickname)).toEqual(['b', 'a']);
  });

  it('storage that reads fine but throws on write keeps submitted entries in memory', async () => {
    const st: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const s = svc('k', st);
    await s.submit(e('a', 1, 1));
    await s.submit(e('b', 2, 2));
    expect((await s.getTop(5)).map((x) => x.nickname)).toEqual(['b', 'a']);
  });

  it('non-finite ts falls back to the injected clock', async () => {
    const s = svc('k', memStorage(), () => 555);
    await s.submit(e('a', 1, NaN));
    await s.submit(e('b', 1, Infinity));
    expect((await s.getTop(5)).map((x) => x.ts)).toEqual([555, 555]);
  });

  it('corrupted JSON is treated as empty and next submit recovers storage', async () => {
    const st = memStorage({ k: '{not json' });
    const s = svc('k', st);
    expect(await s.getTop(5)).toEqual([]);
    await s.submit(e('a', 1, 1));
    expect(await svc('k', st).getTop(5)).toHaveLength(1);
  });

  it('stored value of wrong shape or with invalid items is ignored', async () => {
    const st = memStorage({ k: JSON.stringify([{ score: 'x' }, null, { nickname: 'ok', score: 3 }]) });
    const s = svc('k', st);
    const top = await s.getTop(5);
    expect(top).toHaveLength(1);
    expect(top[0]?.nickname).toBe('ok');
    st.data.k = '{"a":1}';
    expect(await s.getTop(5)).toEqual([]);
  });

  it('service exposes its gameId', () => {
    expect(svc('k', null).gameId).toBe('stack-up');
  });

  it('generic stats of another shape are stored and loaded through the game sanitizer', async () => {
    interface BsStats {
      bugsCaught: number;
      maxCombo: number;
      survivalSec: number;
    }
    const st = memStorage();
    const mk = () =>
      new LocalLeaderboardService<BsStats>({
        gameId: 'bug-squash',
        key: 'bs',
        storage: st,
        sanitizeStats: (raw) => {
          const r = (raw ?? {}) as Record<string, unknown>;
          return { bugsCaught: n0(r.bugsCaught), maxCombo: n0(r.maxCombo), survivalSec: n0(r.survivalSec) };
        },
      });
    await mk().submit({ playerId: 'p1', nickname: 'Neo', score: 90, stats: { bugsCaught: 12, maxCombo: 4, survivalSec: 61.5 }, ts: 1 });
    expect(await mk().getTop(1)).toEqual([{ playerId: 'p1', nickname: 'Neo', score: 90, stats: { bugsCaught: 12, maxCombo: 4, survivalSec: 61.5 }, ts: 1 }]);
  });

  it('old-format Stack Up record keeps score, floors, maxCombo and nickname and gets an unknown playerId', async () => {
    const old = [{ nickname: 'Ann', score: 480, floors: 17, maxCombo: 6, ts: 1234 }];
    const st = memStorage({ k: JSON.stringify(old) });
    expect(await svc('k', st).getTop(5)).toEqual([{ playerId: '', nickname: 'Ann', score: 480, stats: { floors: 17, maxCombo: 6 }, ts: 1234 }]);
  });

  it('old-format records are rewritten in the new format on the next submit without losing them', async () => {
    const st = memStorage({ k: JSON.stringify([{ nickname: 'Old', score: 100, floors: 9, maxCombo: 2, ts: 1 }]) });
    const s = svc('k', st);
    await s.submit({ playerId: 'p', nickname: 'New', score: 50, stats: { floors: 3, maxCombo: 1 }, ts: 2 });
    const stored = JSON.parse(st.data.k as string) as { nickname: string; stats: SuStats; playerId: string }[];
    expect(stored.map((x) => [x.nickname, x.playerId, x.stats.floors])).toEqual([['Old', '', 9], ['New', 'p', 3]]);
  });

  it('submitting to one game never changes the bytes stored under another game key', async () => {
    const other = JSON.stringify([{ playerId: 'x', nickname: 'Z', score: 9, stats: { bugsCaught: 1 }, ts: 1 }]);
    const st = memStorage({ 'bugSquash.leaderboard': other });
    const s = svc('stackup.leaderboard', st);
    expect(await s.getTop(5)).toEqual([]);
    await s.submit(e('a', 5, 1));
    expect(st.data['bugSquash.leaderboard']).toBe(other);
    expect(Object.keys(st.data).sort()).toEqual(['bugSquash.leaderboard', 'stackup.leaderboard']);
  });
});
