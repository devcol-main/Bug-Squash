// media-lib.mjs 의 타입 선언 (tests/media.test.ts 용)
export const KEY_CODES: string[][];
export function cellToCode(cell: number, gridSize: number): string;
export const SAMPLE_NICKNAME: string;
export const SAMPLE_PLAYER_ID: string;
export function sampleLeaderboard(baseTs?: number): Array<{
  playerId: string;
  nickname: string;
  score: number;
  stats: { bugsCaught: number; maxCombo: number; survivalSec: number };
  ts: number;
}>;
export function storageSeed(): Array<[string, string]>;
export const GIF_OVERRIDES: Record<string, number>;
export const GIF_DIE_AT: number;
export const STILL_DIE_AFTER_SEC: number;
export const STILL_3X3_OVERRIDES: Record<string, number>;
export const STILL_4X4_OVERRIDES: Record<string, number>;
export const GIF_DELAY: [number, number];
export const STILL_DELAY: [number, number];
export interface ShotLevel {
  kinds: string[];
  min: number;
  goldenReady?: boolean;
}
export const SHOT_LEVELS: Record<'3x3' | '4x4', ShotLevel[]>;
export const SHOT_RELAX_SEC: number;
export function shotLevelFor(which: '3x3' | '4x4', waitedSec: number): ShotLevel;
export interface Scene {
  size: number;
  expanding: boolean;
  over: boolean;
  kinds: string[];
  goldenReady: boolean;
  taps: number;
}
export function sceneMatches(scene: Scene, which: '3x3' | '4x4', level: ShotLevel): boolean;
export function probeScene(): Scene;
export function buildConcatList(frames: Array<{ file: string; t: number }>, endT: number): string;
export interface GifPreset {
  width: number;
  fps: number;
  colors: number;
}
export const GIF_PRESETS: GifPreset[];
export function ffmpegGifArgs(listFile: string, out: string, p: GifPreset): string[];
export function installBot(opts: { seed: number; delay: [number, number]; dieAt: number | null; skipGolden?: boolean; keyRows: string[][] }): void;
