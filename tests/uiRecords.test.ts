import { describe, expect, it } from 'vitest';
import { BestScore, type StorageLike } from '../src/ui/records';
import { UI_CONFIG } from '../src/ui/uiConfig';

function memStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}
const broken: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('BestScore', () => {
  it('starts at 0 when nothing is stored', () => {
    expect(new BestScore(memStorage(), 'k').value).toBe(0);
  });

  it('higher score updates best, saves it, and reports a new best', () => {
    const s = memStorage();
    const b = new BestScore(s, 'k');
    expect(b.submit(120)).toBe(true);
    expect(b.value).toBe(120);
    expect(s.data.k).toBe('120');
  });

  it('equal or lower score keeps best and is not a new best', () => {
    const b = new BestScore(memStorage({ k: '200' }), 'k');
    expect(b.submit(200)).toBe(false);
    expect(b.submit(50)).toBe(false);
    expect(b.value).toBe(200);
  });

  it('score 0 is never a new best', () => {
    expect(new BestScore(memStorage(), 'k').submit(0)).toBe(false);
  });

  it('restores the stored best and falls back to 0 for corrupted values', () => {
    expect(new BestScore(memStorage({ k: '33' }), 'k').value).toBe(33);
    expect(new BestScore(memStorage({ k: 'abc' }), 'k').value).toBe(0);
    expect(new BestScore(memStorage({ k: '-4' }), 'k').value).toBe(0);
  });

  it('throwing storage keeps working in memory with default values', () => {
    const b = new BestScore(broken, 'k');
    expect(b.value).toBe(0);
    expect(b.submit(7)).toBe(true);
    expect(b.value).toBe(7);
  });

  it('missing storage works in memory only', () => {
    const b = new BestScore(null, 'k');
    expect(b.submit(3)).toBe(true);
    expect(b.value).toBe(3);
  });
});

describe('storage keys', () => {
  it('every bug-squash UI key uses the bugSquash. prefix and none collides with Stack Up keys', () => {
    const keys = [UI_CONFIG.bestKey, UI_CONFIG.legacyNicknameKey, UI_CONFIG.reducedMotionKey, UI_CONFIG.vibrationKey, UI_CONFIG.leaderboardKey];
    for (const k of keys) {
      expect(k.startsWith('bugSquash.')).toBe(true);
      expect(k.startsWith('stackup.')).toBe(false);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('best score is saved under the bug-squash best key only', () => {
    const s = memStorage();
    new BestScore(s, UI_CONFIG.bestKey).submit(10);
    expect(Object.keys(s.data)).toEqual([UI_CONFIG.bestKey]);
  });
});
