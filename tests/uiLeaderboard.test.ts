import { describe, expect, it } from 'vitest';
import { LocalLeaderboardService, type StorageLike } from '../../../shared/leaderboard';
import { UI_CONFIG } from '../src/ui/uiConfig';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => void (data[k] = v) };
}

// 정렬/동점/저장소 오류 처리 자체는 shared/leaderboard/tests/LocalLeaderboardService.test.ts 가 검증한다.
// 여기서는 bug-squash의 연결(저장 키, Top 10)만 확인한다.
describe('bug-squash leaderboard wiring', () => {
  it('entries are stored under the bugSquash.leaderboard key only', async () => {
    const s = memStorage();
    const lb = new LocalLeaderboardService(UI_CONFIG.leaderboardKey, s);
    await lb.submit({ nickname: 'Neo', score: 120, floors: 0, maxCombo: 7 });
    expect(Object.keys(s.data)).toEqual(['bugSquash.leaderboard']);
  });

  it('top 10 is sorted by score descending and ties keep the earlier submission first', async () => {
    const lb = new LocalLeaderboardService(UI_CONFIG.leaderboardKey, memStorage());
    for (let i = 0; i < 12; i++) await lb.submit({ nickname: `P${i}`, score: (i % 4) * 10, floors: 0, maxCombo: i, ts: i });
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
    const lb = new LocalLeaderboardService(UI_CONFIG.leaderboardKey, broken);
    await expect(lb.submit({ nickname: 'Neo', score: 5, floors: 0, maxCombo: 1 })).resolves.toBeUndefined();
    expect((await lb.getTop(10)).map((e) => e.score)).toEqual([5]);
  });

  it('Stack Up entries in the same storage are neither returned nor modified', async () => {
    const stackUpRaw = JSON.stringify([{ nickname: 'SU', score: 999, floors: 20, maxCombo: 5, ts: 1 }]);
    const s = memStorage();
    s.data['stackup.leaderboard'] = stackUpRaw;
    const lb = new LocalLeaderboardService(UI_CONFIG.leaderboardKey, s);
    expect(await lb.getTop(10)).toEqual([]);
    await lb.submit({ nickname: 'Neo', score: 50, floors: 0, maxCombo: 2, ts: 2 });
    expect((await lb.getTop(10)).map((e) => e.nickname)).toEqual(['Neo']);
    expect(s.data['stackup.leaderboard']).toBe(stackUpRaw);
  });
});
