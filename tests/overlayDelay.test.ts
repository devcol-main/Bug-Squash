import { describe, expect, it } from 'vitest';
import { OverlayDelay } from '../src/ui/overlayDelay';

function setup(delay = 1, round = 1) {
  const d = new OverlayDelay<boolean>();
  const fired: boolean[] = [];
  d.start(delay, round, true);
  return { d, fired, fire: (v: boolean) => fired.push(v) };
}

describe('OverlayDelay', () => {
  it('delay elapsed in game over of the same round -> callback runs once with the saved data', () => {
    const { d, fired, fire } = setup();
    d.update(0.6, 1, true, fire);
    expect(fired).toEqual([]);
    d.update(0.5, 1, true, fire);
    expect(fired).toEqual([true]);
    d.update(5, 1, true, fire);
    expect(fired).toEqual([true]);
    expect(d.active).toBe(false);
  });
  // main.ts 는 일시정지 중 update 를 아예 부르지 않는다. 여기서는 복귀 첫 프레임처럼 dt=0 으로 들어오는 경우를 본다.
  it('dt 0 (e.g. first frame after resuming) -> time does not advance and nothing fires', () => {
    const { d, fired, fire } = setup();
    for (let i = 0; i < 100; i++) d.update(0, 1, true, fire);
    expect(fired).toEqual([]);
    expect(d.active).toBe(true);
    d.update(0.75, 1, true, fire);
    expect(fired).toEqual([]);
    d.update(0.25, 1, true, fire);
    expect(fired).toEqual([true]);
  });
  it('cancelled by a new game -> never fires', () => {
    const { d, fired, fire } = setup();
    d.update(0.5, 1, true, fire);
    d.cancel();
    d.update(10, 1, true, fire);
    expect(fired).toEqual([]);
    expect(d.active).toBe(false);
  });
  it('round changed before expiry -> does not fire and the reservation is dropped', () => {
    const { d, fired, fire } = setup(1, 1);
    d.update(2, 2, true, fire);
    expect(fired).toEqual([]);
    expect(d.active).toBe(false);
    d.update(2, 1, true, fire);
    expect(fired).toEqual([]);
  });
  it('phase is no longer game over at expiry -> does not fire', () => {
    const { d, fired, fire } = setup();
    d.update(2, 1, false, fire);
    expect(fired).toEqual([]);
  });
  it('update without a reservation -> does nothing', () => {
    const d = new OverlayDelay<boolean>();
    let n = 0;
    d.update(1, 1, true, () => n++);
    expect(n).toBe(0);
  });
});
