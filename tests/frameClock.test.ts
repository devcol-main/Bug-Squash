import { describe, expect, it } from 'vitest';
import { FrameClock } from '../src/ui/frameClock';

describe('FrameClock', () => {
  it('first tick returns 0 because there is no previous timestamp', () => {
    expect(new FrameClock(0.05).tick(1000)).toBe(0);
  });

  it('normal frames return the elapsed seconds', () => {
    const c = new FrameClock(0.05);
    c.tick(1000);
    expect(c.tick(1016)).toBeCloseTo(0.016, 6);
  });

  it('a long frame is clamped to maxDt', () => {
    const c = new FrameClock(0.05);
    c.tick(0);
    expect(c.tick(5000)).toBe(0.05);
  });

  it('timestamp going backwards returns 0 and keeps counting from the new time', () => {
    const c = new FrameClock(0.05);
    c.tick(1000);
    expect(c.tick(900)).toBe(0);
    expect(c.tick(916)).toBeCloseTo(0.016, 6);
  });

  it('NaN and Infinity timestamps return 0 and do not poison later frames', () => {
    const c = new FrameClock(0.05);
    c.tick(1000);
    expect(c.tick(NaN)).toBe(0);
    expect(c.tick(Infinity)).toBe(0);
    expect(c.tick(1016)).toBeCloseTo(0.016, 6);
  });

  it('paused clock returns 0 for every tick', () => {
    const c = new FrameClock(0.05);
    c.tick(0);
    c.pause();
    expect(c.isPaused).toBe(true);
    expect(c.tick(16)).toBe(0);
    expect(c.tick(10_000)).toBe(0);
  });

  it('first tick after resume returns 0 even after a long hidden time', () => {
    const c = new FrameClock(0.05);
    c.tick(0);
    c.pause();
    c.resume();
    expect(c.tick(60_000)).toBe(0);
    expect(c.tick(60_016)).toBeCloseTo(0.016, 6);
  });

  it('resume without a prior pause keeps the running timestamp', () => {
    const c = new FrameClock(0.05);
    c.tick(0);
    c.resume();
    expect(c.tick(16)).toBeCloseTo(0.016, 6);
  });
});

describe('FrameClock with the bug-squash dt limit', () => {
  it('a long frame is clamped to the 0.1s bug-squash limit', async () => {
    const { UI_CONFIG } = await import('../src/ui/uiConfig');
    const c = new FrameClock(UI_CONFIG.maxFrameDt);
    c.tick(0);
    expect(c.tick(5000)).toBe(0.1);
  });
});
