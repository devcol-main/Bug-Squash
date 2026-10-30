import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../src/shared/leaderboard';
import {
  boardNote,
  createBugSquashLeaderboard,
  createBugSquashOnlineLeaderboard,
  createPlayerProfile,
  makeStats,
  sameLocalEntry,
  sanitizeBugSquashStats,
} from '../src/ui/leaderboard';
import { UI_CONFIG } from '../src/ui/uiConfig';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => void (data[k] = v) };
}

const stats = (maxCombo = 1) => ({ bugsCaught: 5, maxCombo, survivalSec: 42.5 });

// 정렬/동점/저장소 오류 처리 자체는 tests/shared/leaderboard 가 검증한다.
// 여기서는 bug-squash의 연결(저장 키, stats, Top 10)만 확인한다.
describe('bug-squash leaderboard wiring', () => {
  it('entries are stored under the bugSquash.leaderboard key only and the service reports gameId bug-squash', async () => {
    const s = memStorage();
    const lb = createBugSquashLeaderboard(s);
    expect(lb.gameId).toBe('bug-squash');
    await lb.submit({ playerId: 'p', nickname: 'Neo', score: 120, stats: stats(7) });
    expect(Object.keys(s.data)).toEqual(['bugSquash.leaderboard']);
  });

  it('submission keeps bugsCaught, maxCombo and survivalSec and no floors field', async () => {
    const lb = createBugSquashLeaderboard(memStorage());
    await lb.submit({ playerId: 'p', nickname: 'Neo', score: 120, stats: makeStats({ bugsCaught: 9, maxCombo: 4, time: 61.25 }), ts: 1 });
    const [top] = await lb.getTop(1);
    expect(top?.stats).toEqual({ bugsCaught: 9, maxCombo: 4, survivalSec: 61.25 });
    expect(top?.playerId).toBe('p');
    expect('floors' in (top?.stats ?? {})).toBe(false);
  });

  it('stats sanitizer defaults missing values to 0', () => {
    expect(sanitizeBugSquashStats(undefined)).toEqual({ bugsCaught: 0, maxCombo: 0, survivalSec: 0 });
  });

  it('top 10 is sorted by score descending and ties keep the earlier submission first', async () => {
    const lb = createBugSquashLeaderboard(memStorage());
    for (let i = 0; i < 12; i++) await lb.submit({ playerId: 'p', nickname: `P${i}`, score: (i % 4) * 10, stats: stats(i), ts: i });
    const top = await lb.getTop(UI_CONFIG.leaderboardSize);
    expect(top).toHaveLength(10);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.score).toBeGreaterThanOrEqual(top[i]!.score);
    expect(top[0]!.score).toBe(30);
    expect(top[0]!.ts).toBeLessThan(top[1]!.ts);
  });

  it('storage that throws does not break submit or getTop', async () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const lb = createBugSquashLeaderboard(broken);
    await expect(lb.submit({ playerId: 'p', nickname: 'Neo', score: 5, stats: stats() })).resolves.toBeUndefined();
    expect((await lb.getTop(10)).map((e) => e.score)).toEqual([5]);
  });

  it('Stack Up entries in the same storage are neither returned nor modified', async () => {
    const stackUpRaw = JSON.stringify([{ nickname: 'SU', score: 999, floors: 20, maxCombo: 5, ts: 1 }]);
    const s = memStorage();
    s.data['stackup.leaderboard'] = stackUpRaw;
    const lb = createBugSquashLeaderboard(s);
    expect(await lb.getTop(10)).toEqual([]);
    await lb.submit({ playerId: 'p', nickname: 'Neo', score: 50, stats: stats(2), ts: 2 });
    expect((await lb.getTop(10)).map((e) => e.nickname)).toEqual(['Neo']);
    expect(s.data['stackup.leaderboard']).toBe(stackUpRaw);
  });

  it('legacy bugSquash.nickname is imported into the shared profile', () => {
    const s = memStorage();
    s.data['bugSquash.nickname'] = 'Neo';
    expect(createPlayerProfile(s).nickname).toBe('Neo');
    expect(s.data['devcol.player.nickname']).toBe('Neo');
  });
});

describe('bug-squash nickname after Reset', () => {
  it('Reset leaves the profile nickname untouched and an empty input falls back to it instead of Anonymous', async () => {
    const { nicknameToSubmit } = await import('../src/ui/leaderboard');
    const { resetUserData } = await import('../src/ui/options');
    const { BestScore } = await import('../src/ui/records');
    const s = memStorage();
    s.data['devcol.player.nickname'] = 'Neo';
    resetUserData({ best: new BestScore(s, UI_CONFIG.bestKey), storage: s, leaderboardKey: UI_CONFIG.leaderboardKey });
    const profile = createPlayerProfile(s);
    expect(profile.nickname).toBe('Neo');
    expect(nicknameToSubmit('', profile.nickname)).toBe('Neo');
    expect(nicknameToSubmit('Trin', profile.nickname)).toBe('Trin');
    expect(nicknameToSubmit('', '')).toBe('Anonymous');
  });
});

describe('bug-squash online leaderboard wiring', () => {
  it('without an endpoint the online service is local-only and still uses bugSquash.leaderboard', async () => {
    const s = memStorage();
    const lb = createBugSquashOnlineLeaderboard(createPlayerProfile(s), null, s);
    expect(lb.gameId).toBe('bug-squash');
    expect(lb.online).toBe(false);
    const stats = { bugsCaught: 3, maxCombo: 2, survivalSec: 20 };
    await lb.submit({ playerId: 'p', nickname: 'Neo', score: 10, stats, ts: 1, durationMs: 20_000 });
    expect(await lb.getTop(10)).toEqual([{ playerId: 'p', nickname: 'Neo', score: 10, stats, ts: 1 }]);
    expect(lb.lastSource).toBe('local');
    expect(s.data[UI_CONFIG.leaderboardKey]).not.toContain('durationMs');
  });

  it('board note: offline only when a server is configured; renamed names are announced', () => {
    expect(boardNote(true, 'local', null)).toBe('Offline: showing scores on this device');
    expect(boardNote(false, 'local', null)).toBeNull();
    expect(boardNote(true, 'online', { publishedName: 'Player0421', nameStatus: 'ai_fallback' })).toBe('Your name is shown as Player0421.');
    expect(boardNote(true, 'online', { publishedName: 'Player0421', nameStatus: 'ok' })).toBeNull();
  });

  it('local "mine" match needs the same nickname, score and ts', () => {
    const mine = { playerId: 'p', nickname: 'Neo', score: 10, stats: {}, ts: 5 };
    expect(sameLocalEntry({ ...mine }, mine)).toBe(true);
    expect(sameLocalEntry({ ...mine, score: 11 }, mine)).toBe(false);
    expect(sameLocalEntry(mine, null)).toBe(false);
  });
});
