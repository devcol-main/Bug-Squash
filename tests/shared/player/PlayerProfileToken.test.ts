import { describe, expect, it } from 'vitest';
import { PlayerProfile, PLAYER_LB_ENTRIES_KEY, PLAYER_TOKEN_KEY, type ProfileStorage } from '../../../src/shared/player/PlayerProfile';

function mem(init: Record<string, string> = {}): ProfileStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}
const TOKEN = 'ab'.repeat(32);

describe('PlayerProfile online token', () => {
  it('no stored token → null; setToken saves it under devcol.player.token', () => {
    const st = mem();
    const p = new PlayerProfile({ storage: st });
    expect(p.token).toBeNull();
    p.setToken(TOKEN);
    expect(p.token).toBe(TOKEN);
    expect(st.data[PLAYER_TOKEN_KEY]).toBe(TOKEN);
    expect(new PlayerProfile({ storage: st }).token).toBe(TOKEN);
  });

  it('a malformed stored token is ignored', () => {
    expect(new PlayerProfile({ storage: mem({ [PLAYER_TOKEN_KEY]: 'not-a-token' }) }).token).toBeNull();
  });

  it('own entry ids are kept per game and survive a new instance', () => {
    const st = mem();
    const p = new PlayerProfile({ storage: st });
    expect(p.ownEntryId('stack-up')).toBeNull();
    p.setOwnEntryId('stack-up', 12);
    p.setOwnEntryId('bug-squash', 34);
    const q = new PlayerProfile({ storage: st });
    expect(q.ownEntryId('stack-up')).toBe(12);
    expect(q.ownEntryId('bug-squash')).toBe(34);
  });

  it('setToken(null) removes the token and the own entry ids, leaving playerId and nickname', () => {
    const st = mem();
    const p = new PlayerProfile({ storage: st });
    const id = p.playerId;
    p.setNickname('Neo');
    p.setToken(TOKEN);
    p.setOwnEntryId('stack-up', 12);
    p.setToken(null);
    expect(p.token).toBeNull();
    expect(p.ownEntryId('stack-up')).toBeNull();
    expect(st.data[PLAYER_TOKEN_KEY]).toBeUndefined();
    expect(st.data[PLAYER_LB_ENTRIES_KEY]).toBeUndefined();
    expect(new PlayerProfile({ storage: st }).playerId).toBe(id);
    expect(new PlayerProfile({ storage: st }).nickname).toBe('Neo');
  });

  it('corrupt entry ids JSON → treated as empty', () => {
    expect(new PlayerProfile({ storage: mem({ [PLAYER_LB_ENTRIES_KEY]: '{oops' }) }).ownEntryId('stack-up')).toBeNull();
  });

  it('storage that throws → token kept for the session only, nothing throws', () => {
    const broken: ProfileStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const p = new PlayerProfile({ storage: broken });
    expect(p.token).toBeNull();
    p.setToken(TOKEN);
    expect(p.token).toBe(TOKEN);
    p.setOwnEntryId('stack-up', 1);
    expect(p.ownEntryId('stack-up')).toBe(1);
    expect(() => p.setToken(null)).not.toThrow();
  });
});
