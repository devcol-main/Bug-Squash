import { describe, expect, it } from 'vitest';
import { GameFlow } from '../src/ui/flow';
import { DEFAULT_CONFIG } from '../src/core/config';
import { UI_CONFIG } from '../src/ui/uiConfig';

const LOCK = DEFAULT_CONFIG.gameOverInputLock;

describe('GameFlow', () => {
  it('game over input lock comes from the core config (0.6s)', () => {
    expect(UI_CONFIG.gameOverInputLockSec).toBe(0.6);
  });

  it('first tap on title starts the game', () => {
    const f = new GameFlow(LOCK);
    expect(f.phase).toBe('title');
    expect(f.tap()).toBe('start');
    expect(f.phase).toBe('playing');
  });

  it('screen taps while playing do nothing because board taps go through PointerInput', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    expect(f.tap()).toBe('none');
    expect(f.phase).toBe('playing');
  });

  it('endGame moves playing to gameOver, and is ignored on title or twice', () => {
    const f = new GameFlow(LOCK);
    expect(f.endGame()).toBe(false);
    expect(f.phase).toBe('title');
    f.tap();
    expect(f.endGame()).toBe(true);
    expect(f.phase).toBe('gameOver');
    expect(f.endGame()).toBe(false);
  });

  it('taps right after game over are ignored until 0.6s have passed', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    f.endGame();
    expect(f.tap()).toBe('none');
    f.update(0.59);
    expect(f.tap()).toBe('none');
    expect(f.phase).toBe('gameOver');
    f.update(0.02);
    expect(f.tap()).toBe('retry');
    expect(f.phase).toBe('playing');
  });

  it('full cycle title to playing to game over to retry returns to playing with a new round', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    const r0 = f.round;
    f.endGame();
    f.update(1);
    expect(f.tap()).toBe('retry');
    expect(f.phase).toBe('playing');
    expect(f.round).toBe(r0 + 1);
  });

  it('time spent playing does not count toward the game over lock', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    f.update(5);
    f.endGame();
    expect(f.tap()).toBe('none');
  });

  it('submit can be claimed once per game over and again after retry', () => {
    const f = new GameFlow(LOCK);
    expect(f.claimSubmit()).toBe(false);
    f.tap();
    expect(f.claimSubmit()).toBe(false);
    f.endGame();
    expect(f.claimSubmit()).toBe(true);
    expect(f.claimSubmit()).toBe(false);
    f.update(1);
    f.tap();
    f.endGame();
    expect(f.claimSubmit()).toBe(true);
  });

  it('startNow jumps straight to playing from game over even during the lock', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    f.endGame();
    f.startNow();
    expect(f.phase).toBe('playing');
    expect(f.submitted).toBe(false);
  });

  it('cannot open options while playing', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    expect(f.openOptions()).toBe(false);
  });

  it('taps are ignored while options are open, and work after closing', () => {
    const f = new GameFlow(LOCK);
    expect(f.openOptions()).toBe(true);
    expect(f.tap()).toBe('none');
    f.closeOptions();
    expect(f.tap()).toBe('start');
  });

  it('retry is ignored while options are open on game over', () => {
    const f = new GameFlow(LOCK);
    f.tap();
    f.endGame();
    f.update(1);
    f.openOptions();
    expect(f.tap()).toBe('none');
    f.closeOptions();
    expect(f.tap()).toBe('retry');
  });
});
