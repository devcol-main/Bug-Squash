import { describe, expect, it } from 'vitest';
import { ConfirmGate, BoolStore, effectiveReducedMotion, hudBest, reducedMotionStore, resetUserData, vibrationStore } from '../src/ui/options';
import { BestScore, NicknameStore, type StorageLike } from '../src/ui/records';
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

describe('reduced motion', () => {
  it('either OS or manual setting on gives reduced motion', () => {
    expect(effectiveReducedMotion(false, false)).toBe(false);
    expect(effectiveReducedMotion(true, false)).toBe(true);
    expect(effectiveReducedMotion(false, true)).toBe(true);
    expect(effectiveReducedMotion(true, true)).toBe(true);
  });

  it('saved manual setting is restored by a new store', () => {
    const s = memStorage();
    reducedMotionStore(s, 'k').save(true);
    expect(reducedMotionStore(s, 'k').load()).toBe(true);
    reducedMotionStore(s, 'k').save(false);
    expect(reducedMotionStore(s, 'k').load()).toBe(false);
  });

  it('defaults to off with missing, invalid, or throwing storage', () => {
    expect(reducedMotionStore(null, 'k').load()).toBe(false);
    expect(reducedMotionStore(memStorage({ k: 'maybe' }), 'k').load()).toBe(false);
    const st = reducedMotionStore(broken, 'k');
    expect(st.load()).toBe(false);
    expect(() => st.save(true)).not.toThrow();
  });
});

describe('vibration setting', () => {
  it('defaults to on when nothing is stored', () => {
    expect(vibrationStore(memStorage(), 'v').load()).toBe(true);
  });

  it('saved off and on are restored by a new store', () => {
    const s = memStorage();
    vibrationStore(s, 'v').save(false);
    expect(s.data.v).toBe('0');
    expect(vibrationStore(s, 'v').load()).toBe(false);
    vibrationStore(s, 'v').save(true);
    expect(vibrationStore(s, 'v').load()).toBe(true);
  });

  it('invalid stored values fall back to the default (on)', () => {
    for (const bad of ['', 'true', '2', 'null', '{}']) {
      expect(vibrationStore(memStorage({ v: bad }), 'v').load()).toBe(true);
    }
  });

  it('missing or throwing storage defaults to on without errors', () => {
    expect(vibrationStore(null, 'v').load()).toBe(true);
    const st = vibrationStore(broken, 'v');
    expect(st.load()).toBe(true);
    expect(() => st.save(false)).not.toThrow();
  });

  it('BoolStore uses the given fallback for invalid values', () => {
    expect(new BoolStore(memStorage({ x: 'zzz' }), 'x', false).load()).toBe(false);
    expect(new BoolStore(memStorage({ x: 'zzz' }), 'x', true).load()).toBe(true);
  });
});

describe('resetUserData', () => {
  it('clears best, nickname and the leaderboard but leaves Stack Up and settings keys alone', () => {
    const s = memStorage({
      [UI_CONFIG.bestKey]: '400',
      [UI_CONFIG.nicknameKey]: 'ABC',
      [UI_CONFIG.leaderboardKey]: '[{"score":400}]',
      [UI_CONFIG.vibrationKey]: '0',
      [UI_CONFIG.reducedMotionKey]: '1',
      'bugSquash.audio.muted': '1',
      'stackup.best': '40',
      'stackup.nickname': 'XYZ',
      'stackup.leaderboard': '[{"score":40}]',
    });
    const best = new BestScore(s, UI_CONFIG.bestKey);
    const nick = new NicknameStore(s, UI_CONFIG.nicknameKey, 12);
    resetUserData({ best, nickname: nick, storage: s, leaderboardKey: UI_CONFIG.leaderboardKey });
    expect(best.value).toBe(0);
    expect(nick.value).toBe('');
    expect(new BestScore(s, UI_CONFIG.bestKey).value).toBe(0);
    expect(s.data[UI_CONFIG.leaderboardKey]).toBe('[]');
    expect(s.data[UI_CONFIG.vibrationKey]).toBe('0');
    expect(s.data[UI_CONFIG.reducedMotionKey]).toBe('1');
    expect(s.data['bugSquash.audio.muted']).toBe('1');
    expect(s.data['stackup.best']).toBe('40');
    expect(s.data['stackup.nickname']).toBe('XYZ');
    expect(s.data['stackup.leaderboard']).toBe('[{"score":40}]');
  });

  it('throwing or missing storage does not raise and memory values are reset', () => {
    for (const storage of [broken, null]) {
      const best = new BestScore(storage, 'best');
      best.submit(10);
      const nick = new NicknameStore(storage, 'nick', 12);
      nick.save('A');
      expect(() => resetUserData({ best, nickname: nick, storage, leaderboardKey: 'lb' })).not.toThrow();
      expect(best.value).toBe(0);
      expect(nick.value).toBe('');
    }
  });
});

describe('hudBest', () => {
  it('shows the stored best until the score passes it, then follows the score', () => {
    expect(hudBest(100, 40)).toBe(100);
    expect(hudBest(100, 120)).toBe(120);
    expect(hudBest(0, 0)).toBe(0);
  });
});

describe('ConfirmGate', () => {
  it('first press arms and a second press within the window confirms', () => {
    const g = new ConfirmGate(3000);
    expect(g.press(0)).toBe('armed');
    expect(g.armed).toBe(true);
    expect(g.press(1000)).toBe('confirmed');
    expect(g.armed).toBe(false);
  });
  it('pressing after the window expires only re-arms', () => {
    const g = new ConfirmGate(3000);
    g.press(0);
    expect(g.press(3500)).toBe('armed');
  });
  it('cancel disarms so the next press needs confirmation again', () => {
    const g = new ConfirmGate(3000);
    g.press(0);
    g.cancel();
    expect(g.armed).toBe(false);
    expect(g.press(100)).toBe('armed');
  });
});
