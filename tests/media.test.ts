import { describe, expect, it } from 'vitest';
import {
  GIF_DIE_AT, GIF_OVERRIDES, GIF_PRESETS, KEY_CODES, STILL_3X3_OVERRIDES, STILL_4X4_OVERRIDES, SHOT_LEVELS, buildConcatList, cellToCode, ffmpegGifArgs, sampleLeaderboard, sceneMatches, shotLevelFor, storageSeed,
} from '../scripts/lib/media-lib.mjs';
import { KEY_ROWS, keyToCell } from '../src/input/keyToCell';
import { createBugSquashLeaderboard } from '../src/ui/leaderboard';
import { UI_CONFIG } from '../src/ui/uiConfig';
import { DEFAULT_CONFIG } from '../src/core/config';
import { PLAYER_ID_KEY, PLAYER_NICKNAME_KEY } from '../src/shared/player';

class MemStorage {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
}

describe('media key mapping', () => {
  it('capture key table equals the game KEY_ROWS codes', () => {
    expect(KEY_CODES).toEqual(KEY_ROWS.map((row) => row.map((k) => k.code)));
  });
  it.each([3, 4])('every cell of a %ix%i board maps back to itself through keyToCell', (size) => {
    for (let cell = 0; cell < size * size; cell++) expect(keyToCell(cellToCode(cell, size), size)).toBe(cell);
  });
  it('out-of-range cells give an empty code', () => {
    expect(cellToCode(9, 3)).toBe('');
    expect(cellToCode(-1, 4)).toBe('');
    expect(cellToCode(16, 4)).toBe('');
  });
});

describe('sample leaderboard', () => {
  it('survives the leaderboard sanitizer unchanged and is sorted by score', async () => {
    const storage = new MemStorage();
    const seed = new Map(storageSeed());
    storage.setItem(UI_CONFIG.leaderboardKey, seed.get(UI_CONFIG.leaderboardKey) as string);
    const top = await createBugSquashLeaderboard(storage).getTop(10);
    expect(top).toHaveLength(10);
    expect(top).toEqual(sampleLeaderboard().slice(0, 10));
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.score).toBeGreaterThan(top[i]!.score);
  });
  it('seeds the storage keys the game actually reads', () => {
    const keys = storageSeed().map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining([UI_CONFIG.leaderboardKey, UI_CONFIG.bestKey, PLAYER_ID_KEY, PLAYER_NICKNAME_KEY]));
  });
});

describe('capture overrides', () => {
  it('only use existing core config keys', () => {
    for (const o of [GIF_OVERRIDES, STILL_3X3_OVERRIDES, STILL_4X4_OVERRIDES]) {
      for (const k of Object.keys(o)) expect(Object.keys(DEFAULT_CONFIG)).toContain(k);
    }
  });
  it('gif dying starts after the board expansion finishes', () => {
    expect(GIF_DIE_AT).toBeGreaterThan(GIF_OVERRIDES.expandAt! + DEFAULT_CONFIG.expandPause);
  });
});

describe('gif frames and ffmpeg', () => {
  it('concat list gives each frame its duration and repeats the last file', () => {
    const list = buildConcatList([{ file: '/t/a.jpg', t: 1 }, { file: '/t/b.jpg', t: 1.5 }], 2.25);
    expect(list).toBe("file '/t/a.jpg'\nduration 0.5000\nfile '/t/b.jpg'\nduration 0.7500\nfile '/t/b.jpg'\n");
  });
  it('concat list escapes single quotes and keeps a minimum duration for equal timestamps', () => {
    const list = buildConcatList([{ file: "/t/it's.jpg", t: 1 }, { file: '/t/b.jpg', t: 1 }], 1);
    expect(list).toContain("file '/t/it'\\''s.jpg'");
    expect(list).toContain('duration 0.0010');
  });
  it('empty frame list gives an empty string', () => {
    expect(buildConcatList([], 1)).toBe('');
  });
  it('ffmpeg args use concat input, the preset values, and infinite loop', () => {
    const args = ffmpegGifArgs('/t/l.txt', '/o/x.gif', { width: 320, fps: 12, colors: 96 });
    expect(args.slice(0, 2)).toEqual(['-y', '-loglevel']);
    expect(args.slice(args.indexOf('-f'), args.indexOf('-f') + 6)).toEqual(['-f', 'concat', '-safe', '0', '-i', '/t/l.txt']);
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('fps=12');
    expect(vf).toContain('scale=320:-1');
    expect(vf).toContain('max_colors=96');
    expect(args.slice(-3)).toEqual(['-loop', '0', '/o/x.gif']);
  });
  it('gif presets go from large to small so the first fit is the best quality', () => {
    for (let i = 1; i < GIF_PRESETS.length; i++) {
      const a = GIF_PRESETS[i - 1]!;
      const b = GIF_PRESETS[i]!;
      expect(b.width).toBeLessThanOrEqual(a.width);
      expect(b.fps).toBeLessThanOrEqual(a.fps);
      expect(b.colors).toBeLessThanOrEqual(a.colors);
    }
  });
});

describe('still shot conditions', () => {
  const scene = (o: Partial<{ size: number; expanding: boolean; over: boolean; kinds: string[]; goldenReady: boolean; taps: number }> = {}) => ({
    size: 3, expanding: false, over: false, kinds: ['bug', 'hard', 'feature'], goldenReady: false, taps: 1, ...o,
  });
  it('strict 3x3 level needs a hard bug and a feature among three objects', () => {
    const lv = SHOT_LEVELS['3x3'][0]!;
    expect(sceneMatches(scene(), '3x3', lv)).toBe(true);
    expect(sceneMatches(scene({ kinds: ['bug', 'bug', 'feature'] }), '3x3', lv)).toBe(false);
    expect(sceneMatches(scene({ kinds: ['hard', 'feature'] }), '3x3', lv)).toBe(false);
  });
  it('scene without a first key press is rejected so key hints are visible', () => {
    expect(sceneMatches(scene({ taps: 0 }), '3x3', SHOT_LEVELS['3x3'][2]!)).toBe(false);
  });
  it('wrong board size, expanding and game over scenes are rejected', () => {
    const lv = SHOT_LEVELS['4x4'][2]!;
    expect(sceneMatches(scene({ size: 3 }), '4x4', lv)).toBe(false);
    expect(sceneMatches(scene({ size: 4, expanding: true }), '4x4', lv)).toBe(false);
    expect(sceneMatches(scene({ size: 4, over: true }), '4x4', lv)).toBe(false);
    expect(sceneMatches(scene({ size: 4 }), '4x4', lv)).toBe(true);
  });
  it('strict 4x4 level needs a fully visible golden bug, not one that is just appearing or being caught', () => {
    const lv = SHOT_LEVELS['4x4'][0]!;
    const four = { size: 4, kinds: ['golden', 'bug', 'feature'] };
    expect(sceneMatches(scene({ ...four, goldenReady: true }), '4x4', lv)).toBe(true);
    expect(sceneMatches(scene({ ...four, goldenReady: false }), '4x4', lv)).toBe(false);
  });
  it('waiting longer relaxes the level down to the last one', () => {
    expect(shotLevelFor('4x4', 0)).toBe(SHOT_LEVELS['4x4'][0]);
    expect(shotLevelFor('4x4', 1000)).toBe(SHOT_LEVELS['4x4'][SHOT_LEVELS['4x4'].length - 1]);
  });
});
