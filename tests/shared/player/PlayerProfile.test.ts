// Arcade-Web `shared/`에서 복사 (2026-10-15 분리 시점)
import { describe, expect, it } from 'vitest';
import { PlayerProfile, PLAYER_ID_KEY, PLAYER_NICKNAME_KEY, type ProfileStorage } from '../../../src/shared/player/PlayerProfile';

function mem(init: Record<string, string> = {}): ProfileStorage & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => void (data[k] = v) };
}
const broken: ProfileStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};
const LEGACY = ['stackup.nickname', 'bugSquash.nickname'];

describe('PlayerProfile playerId', () => {
  it('first access creates an id, saves it, and the same id is returned afterwards', () => {
    const st = mem();
    const p = new PlayerProfile({ storage: st });
    const id = p.playerId;
    expect(id).not.toBe('');
    expect(p.playerId).toBe(id);
    expect(st.data[PLAYER_ID_KEY]).toBe(id);
  });

  it('a new profile instance on the same storage reuses the stored id', () => {
    const st = mem();
    const id = new PlayerProfile({ storage: st }).playerId;
    expect(new PlayerProfile({ storage: st }).playerId).toBe(id);
  });

  it('the generator runs only once even when read many times', () => {
    let calls = 0;
    const p = new PlayerProfile({ storage: mem(), generateId: () => `id${++calls}` });
    p.playerId;
    p.playerId;
    expect(calls).toBe(1);
  });

  it('throwing storage keeps the id stable for the session', () => {
    const p = new PlayerProfile({ storage: broken });
    expect(p.playerId).toBe(p.playerId);
    expect(p.playerId).not.toBe('');
  });

  it('null storage keeps the id stable for the session', () => {
    const p = new PlayerProfile({ storage: null });
    expect(p.playerId).toBe(p.playerId);
  });

  it('default id generator produces distinct ids', () => {
    expect(new PlayerProfile({ storage: null }).playerId).not.toBe(new PlayerProfile({ storage: null }).playerId);
  });
});

describe('PlayerProfile nickname', () => {
  it('saved nickname is stored under the common key and restored by a new instance', () => {
    const st = mem();
    new PlayerProfile({ storage: st }).setNickname('Neo');
    expect(st.data[PLAYER_NICKNAME_KEY]).toBe('Neo');
    expect(new PlayerProfile({ storage: st }).nickname).toBe('Neo');
  });

  it('nickname is empty when nothing is stored anywhere', () => {
    expect(new PlayerProfile({ storage: mem(), legacyNicknameKeys: LEGACY }).nickname).toBe('');
  });

  it('missing common nickname imports the legacy value once and saves it to the common key', () => {
    const st = mem({ 'bugSquash.nickname': 'Bug' });
    const p = new PlayerProfile({ storage: st, legacyNicknameKeys: LEGACY });
    expect(p.nickname).toBe('Bug');
    expect(st.data[PLAYER_NICKNAME_KEY]).toBe('Bug');
    st.data['bugSquash.nickname'] = 'Changed';
    expect(new PlayerProfile({ storage: st, legacyNicknameKeys: LEGACY }).nickname).toBe('Bug');
  });

  it('legacy keys are tried in the given order and empty values are skipped', () => {
    const both = mem({ 'stackup.nickname': 'Stack', 'bugSquash.nickname': 'Bug' });
    expect(new PlayerProfile({ storage: both, legacyNicknameKeys: LEGACY }).nickname).toBe('Stack');
    const skipEmpty = mem({ 'stackup.nickname': '  ', 'bugSquash.nickname': 'Bug' });
    expect(new PlayerProfile({ storage: skipEmpty, legacyNicknameKeys: LEGACY }).nickname).toBe('Bug');
  });

  it('an existing common nickname wins over legacy values', () => {
    const st = mem({ [PLAYER_NICKNAME_KEY]: 'Common', 'stackup.nickname': 'Stack' });
    expect(new PlayerProfile({ storage: st, legacyNicknameKeys: LEGACY }).nickname).toBe('Common');
  });

  it('nickname is truncated to the max length', () => {
    const p = new PlayerProfile({ storage: mem() });
    p.setNickname('ABCDEFGHIJKLMNOP');
    expect(p.nickname).toBe('ABCDEFGHIJKL');
  });

  it('throwing or missing storage still keeps the nickname in memory', () => {
    for (const storage of [broken, null]) {
      const p = new PlayerProfile({ storage, legacyNicknameKeys: LEGACY });
      expect(p.nickname).toBe('');
      expect(() => p.setNickname('Neo')).not.toThrow();
      expect(p.nickname).toBe('Neo');
    }
  });
});
