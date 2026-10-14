import { describe, expect, it } from 'vitest';
import { BugSquashLogic, type BugSquashEvent, type EventBuffer } from '../src/core/BugSquashLogic';
import { DEFAULT_CONFIG, type BugSquashConfig } from '../src/core/config';
import { exposureTime, featureRatio, maxConcurrent, spawnInterval } from '../src/core/difficulty';
import { createRng } from '../src/core/rng';
import { multiplierForCombo } from '../src/core/scoring';

const C = DEFAULT_CONFIG;
/** 자동 출현을 끈 설정: 테스트가 forceSpawn 으로만 오브젝트를 둔다. */
const QUIET: Partial<BugSquashConfig> = { firstSpawnDelay: 1e9, spawnIntervalStart: 1e9, spawnIntervalMin: 1e9 };

function quiet(over: Partial<BugSquashConfig> = {}, seed = 1): BugSquashLogic {
  return new BugSquashLogic(createRng(seed), { ...QUIET, ...over });
}
function types(b: EventBuffer): string[] {
  const out: string[] = [];
  for (let i = 0; i < b.length; i++) out.push(b.at(i).type);
  return out;
}
function find(b: EventBuffer, type: string): BugSquashEvent | undefined {
  for (let i = 0; i < b.length; i++) if (b.at(i).type === type) return b.at(i);
  return undefined;
}
function catchN(g: BugSquashLogic, n: number): void {
  for (let i = 0; i < n; i++) {
    g.forceSpawn(0, 'bug', 100);
    g.tap(0);
  }
}

describe('catching bugs', () => {
  it('tapping a normal bug catches it and adds score and combo', () => {
    const g = quiet();
    g.forceSpawn(4, 'bug');
    const ev = g.tap(4);
    expect(types(ev)).toContain('caught');
    const e = find(ev, 'caught')!;
    expect(e.cell).toBe(4);
    expect(e.kind).toBe('bug');
    expect(e.points).toBe(10);
    expect(g.score).toBe(10);
    expect(g.combo).toBe(1);
    expect(g.bugsCaught).toBe(1);
    expect(g.getCell(4).kind).toBeNull();
    expect(g.lives).toBe(3);
  });

  it('first tap on a hard bug leaves it standing and the second tap catches it for 25', () => {
    const g = quiet();
    g.forceSpawn(0, 'hard');
    const first = g.tap(0);
    expect(types(first)).toEqual(['hardHit']);
    expect(g.getCell(0).kind).toBe('hard');
    expect(g.score).toBe(0);
    expect(g.combo).toBe(0);
    const second = g.tap(0);
    expect(find(second, 'caught')!.points).toBe(25);
    expect(g.getCell(0).kind).toBeNull();
    expect(g.combo).toBe(1);
  });

  it('hard bug hit once then timing out counts as a miss costing one life', () => {
    const g = quiet();
    g.forceSpawn(0, 'hard', 1);
    g.tap(0);
    const ev = g.update(1.1);
    const m = find(ev, 'missed')!;
    expect(m.kind).toBe('hard');
    expect(m.lifeDelta).toBe(-1);
    expect(g.lives).toBe(2);
  });

  it('bug timing out costs one life and resets combo', () => {
    const g = quiet();
    catchN(g, 3);
    expect(g.combo).toBe(3);
    g.forceSpawn(1, 'bug', 0.5);
    const ev = g.update(0.6);
    expect(types(ev)).toEqual(['missed', 'comboReset', 'lifeChanged']);
    expect(find(ev, 'comboReset')!.combo).toBe(3);
    expect(g.lives).toBe(2);
    expect(g.combo).toBe(0);
  });
});

describe('features', () => {
  it('tapping a feature costs one life, resets combo and keeps the score', () => {
    const g = quiet();
    catchN(g, 2);
    const score = g.score;
    g.forceSpawn(5, 'feature');
    const ev = g.tap(5);
    expect(types(ev)[0]).toBe('featureTapped');
    expect(find(ev, 'featureTapped')!.lifeDelta).toBe(-1);
    expect(g.lives).toBe(2);
    expect(g.combo).toBe(0);
    expect(g.score).toBe(score);
    expect(g.getCell(5).kind).toBeNull();
  });

  it('feature timing out changes nothing', () => {
    const g = quiet();
    catchN(g, 2);
    g.forceSpawn(5, 'feature', 0.5);
    const ev = g.update(0.6);
    expect(types(ev)).toEqual(['featureExpired']);
    expect(g.lives).toBe(3);
    expect(g.combo).toBe(2);
  });
});

describe('golden bug', () => {
  it('catching golden with full lives gives 50 points and keeps lives at 3', () => {
    const g = quiet();
    g.forceSpawn(0, 'golden');
    const ev = g.tap(0);
    expect(find(ev, 'caught')!.points).toBe(50);
    expect(g.score).toBe(50);
    expect(g.lives).toBe(3);
    expect(find(ev, 'lifeChanged')).toBeUndefined();
  });

  it('catching golden with fewer than 3 lives restores one life', () => {
    const g = quiet();
    g.forceSpawn(0, 'bug', 0.1);
    g.update(0.2);
    expect(g.lives).toBe(2);
    g.forceSpawn(1, 'golden');
    const ev = g.tap(1);
    expect(g.lives).toBe(3);
    expect(find(ev, 'caught')!.lifeDelta).toBe(1);
    expect(find(ev, 'lifeChanged')!.lives).toBe(3);
  });

  it('golden points are multiplied by the combo multiplier', () => {
    const g = quiet();
    catchN(g, 4); // combo 4 -> 다음 잡기로 5가 되어 x2
    g.forceSpawn(0, 'golden');
    const ev = g.tap(0);
    expect(find(ev, 'caught')!.points).toBe(100);
  });

  it('missing golden keeps lives, and still resets combo', () => {
    const g = quiet();
    catchN(g, 2);
    g.forceSpawn(0, 'golden', 0.3);
    const ev = g.update(0.4);
    expect(find(ev, 'missed')!.lifeDelta).toBe(0);
    expect(g.lives).toBe(3);
    expect(find(ev, 'lifeChanged')).toBeUndefined();
    expect(find(ev, 'comboReset')!.combo).toBe(2);
    expect(g.combo).toBe(0);
  });
});

describe('empty tap', () => {
  it('tapping an empty cell only resets combo', () => {
    const g = quiet();
    catchN(g, 3);
    const score = g.score;
    const ev = g.tap(7);
    expect(types(ev)).toEqual(['emptyTap', 'comboReset']);
    expect(g.combo).toBe(0);
    expect(g.lives).toBe(3);
    expect(g.score).toBe(score);
  });

  it('tapping an out-of-range cell is ignored', () => {
    const g = quiet();
    catchN(g, 1);
    expect(g.tap(9).length).toBe(0);
    expect(g.tap(-1).length).toBe(0);
    expect(g.combo).toBe(1);
  });
});

describe('combo multiplier', () => {
  it('multiplier steps at 5, 10 and 20 and caps at x4', () => {
    const m = (c: number) => multiplierForCombo(c, C);
    expect([m(0), m(4), m(5), m(9), m(10), m(19), m(20), m(100)]).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('the catch that reaches combo 5 is scored with the new x2 multiplier', () => {
    const g = quiet();
    catchN(g, 4);
    expect(g.score).toBe(40);
    g.forceSpawn(0, 'bug', 100);
    const ev = g.tap(0);
    expect(find(ev, 'caught')!.points).toBe(20);
    expect(find(ev, 'caught')!.multiplier).toBe(2);
    expect(find(ev, 'multiplierUp')!.multiplier).toBe(2);
    expect(g.multiplier).toBe(2);
  });

  it('combo 19 -> 20 raises the multiplier to x4 and it stays at x4', () => {
    const g = quiet();
    catchN(g, 19);
    expect(g.multiplier).toBe(3);
    catchN(g, 1);
    expect(g.multiplier).toBe(4);
    catchN(g, 10);
    expect(g.multiplier).toBe(4);
    expect(g.maxCombo).toBe(30);
  });
});

describe('game over', () => {
  it('losing the last life ends the game and ignores later taps and updates', () => {
    const g = quiet();
    g.forceSpawn(0, 'feature');
    g.forceSpawn(1, 'feature');
    g.forceSpawn(2, 'feature');
    g.forceSpawn(3, 'bug', 100);
    g.tap(0);
    g.tap(1);
    const ev = g.tap(2);
    expect(g.lives).toBe(0);
    expect(g.isGameOver).toBe(true);
    expect(types(ev)).toContain('gameOver');
    const score = g.score;
    expect(g.tap(3).length).toBe(0);
    expect(g.update(5).length).toBe(0);
    expect(g.score).toBe(score);
    expect(g.time).toBeLessThan(1);
  });

  it('remaining objects are not judged once the game is over', () => {
    const g = quiet();
    g.forceSpawn(0, 'bug', 0.1);
    g.forceSpawn(1, 'bug', 0.1);
    g.forceSpawn(2, 'bug', 0.1);
    g.forceSpawn(3, 'bug', 0.1);
    const ev = g.update(0.2);
    expect(g.isGameOver).toBe(true);
    expect(g.lives).toBe(0);
    let missed = 0;
    for (let i = 0; i < ev.length; i++) if (ev.at(i).type === 'missed') missed++;
    expect(missed).toBe(3);
  });
});

describe('board expansion', () => {
  it('board expands to 4x4 at exactly 45 seconds, not before', () => {
    const g = quiet();
    g.update(44.9);
    expect(g.boardSize).toBe(3);
    expect(g.isExpanding).toBe(false);
    const ev = g.update(0.1);
    expect(g.boardSize).toBe(4);
    expect(g.cellCount).toBe(16);
    expect(types(ev)).toEqual(['boardExpand']);
    expect(g.time).toBeCloseTo(45, 9);
  });

  it('a single huge dt still expands exactly once at 45 seconds', () => {
    const g = quiet();
    const ev = g.update(60);
    expect(g.boardSize).toBe(4);
    expect(types(ev).filter((t) => t === 'boardExpand').length).toBe(1);
    expect(g.time).toBeCloseTo(60, 9);
    expect(g.update(10).length).toBe(0);
    expect(g.boardSize).toBe(4);
  });

  it('existing objects are removed without penalty at expansion', () => {
    const g = quiet();
    g.update(44.9);
    g.forceSpawn(0, 'bug', 10);
    g.forceSpawn(1, 'hard', 10);
    g.forceSpawn(2, 'feature', 10);
    g.tap(5); // 빈 칸: 콤보 0이라 이벤트만
    const ev = g.update(0.1);
    expect(types(ev).filter((t) => t === 'cleared').length).toBe(3);
    expect(find(ev, 'missed')).toBeUndefined();
    expect(g.lives).toBe(3);
    expect(g.activeCount).toBe(0);
    for (let i = 0; i < 16; i++) expect(g.getCell(i).kind).toBeNull();
  });

  it('spawning is paused for 1.5 seconds after expansion and resumes afterwards', () => {
    const g = new BugSquashLogic(createRng(3), { startLives: 1e6, maxLives: 1e6 });
    g.update(45);
    expect(g.isExpanding).toBe(true);
    let spawnedAt = -1;
    for (let t = 0; t < 4 && spawnedAt < 0; t += 0.05) {
      const ev = g.update(0.05);
      if (find(ev, 'spawn')) spawnedAt = g.time - 45;
    }
    expect(spawnedAt).toBeGreaterThanOrEqual(1.5 - 1e-6);
    expect(spawnedAt).toBeLessThan(1.6);
  });

  it('taps during the expansion animation are ignored', () => {
    const g = quiet();
    catchN(g, 2);
    g.update(45);
    expect(g.tap(0).length).toBe(0);
    expect(g.combo).toBe(2);
    g.update(1.6);
    expect(g.isExpanding).toBe(false);
    expect(types(g.tap(0))).toContain('emptyTap');
  });
});

describe('spawn constraints', () => {
  it('active objects never exceed the concurrent cap (2/3 on 3x3, 4/5 on 4x4)', () => {
    const g = new BugSquashLogic(createRng(5), {
      startLives: 1e6,
      maxLives: 1e6,
      exposureStart: 1000,
      exposureMin: 1000,
    });
    const seen = new Map<string, number>();
    for (let t = 0; t < 150; t += 0.05) {
      g.update(0.05);
      const cap = maxConcurrent(g.boardSize, g.time, C);
      expect(g.activeCount).toBeLessThanOrEqual(cap);
      if (g.time > 20 && g.time < 29) seen.set('small', g.activeCount);
      if (g.time > 40 && g.time < 44) seen.set('smallLate', g.activeCount);
      if (g.time > 60 && g.time < 85) seen.set('large', g.activeCount);
      if (g.time > 100) seen.set('largeLate', g.activeCount);
    }
    expect(seen.get('small')).toBe(2);
    expect(seen.get('smallLate')).toBe(3);
    expect(seen.get('large')).toBe(4);
    expect(seen.get('largeLate')).toBe(5);
  });

  it('at most one golden bug is on screen at a time', () => {
    const g = new BugSquashLogic(createRng(9), {
      startLives: 1e6,
      maxLives: 1e6,
      goldenChance: 0.9,
      goldenFrom: 0,
      featureRatioStart: 0,
      featureRatioPerSec: 0,
    });
    let goldenSeen = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const ev = g.update(0.05);
      for (let i = 0; i < ev.length; i++) if (ev.at(i).type === 'spawn' && ev.at(i).kind === 'golden') goldenSeen++;
      let golden = 0;
      for (let c = 0; c < g.cellCount; c++) if (g.getCell(c).kind === 'golden') golden++;
      expect(golden).toBeLessThanOrEqual(1);
    }
    expect(goldenSeen).toBeGreaterThan(3);
  });

  it('a cell never respawns within the 0.2s cooldown after its object left', () => {
    const g = new BugSquashLogic(createRng(11), { startLives: 1e6, maxLives: 1e6 });
    const leftAt = new Map<number, number>();
    const dt = 0.016;
    let spawns = 0;
    for (let f = 0; f < 9000; f++) {
      const ev = g.update(dt);
      for (let i = 0; i < ev.length; i++) {
        const e = ev.at(i);
        if (e.type === 'missed' || e.type === 'featureExpired' || e.type === 'cleared') leftAt.set(e.cell, g.time);
        if (e.type === 'spawn') {
          spawns++;
          const left = leftAt.get(e.cell);
          if (left !== undefined && left !== 45) expect(g.time - left).toBeGreaterThanOrEqual(C.cellCooldown - 1e-6);
        }
      }
      // 일부 칸은 탭해서 잡기/기능 탭 경로의 쿨다운도 검증
      if (f % 7 === 0) {
        const cell = f % g.cellCount;
        const had = g.getCell(cell).kind;
        const tev = g.tap(cell);
        if (had !== null && find(tev, 'emptyTap') === undefined && g.getCell(cell).kind === null) leftAt.set(cell, g.time);
      }
    }
    expect(spawns).toBeGreaterThan(50);
  });

  it('a cell freed by tapping is not chosen again before the cooldown ends', () => {
    // 3x3 중 8칸을 막아 두고 1칸만 비워 두면, 쿨다운이 끝나기 전에는 출현할 칸이 없다.
    const g = new BugSquashLogic(createRng(2), { firstSpawnDelay: 0, spawnIntervalStart: 0.01, spawnIntervalMin: 0.01 });
    for (let c = 0; c < 8; c++) g.forceSpawn(c, 'feature', 100);
    g.forceSpawn(8, 'feature', 100);
    g.tap(8);
    const ev = g.update(0.1); // 쿨다운 0.2 중
    expect(find(ev, 'spawn')).toBeUndefined();
    expect(g.getCell(8).kind).toBeNull();
  });
});

describe('difficulty curve', () => {
  it('spawn interval shrinks with play time and stops at the floor', () => {
    expect(spawnInterval(0, C)).toBeCloseTo(1.0);
    expect(spawnInterval(10, C)).toBeCloseTo(Math.pow(0.985, 10));
    expect(spawnInterval(10, C)).toBeLessThan(spawnInterval(0, C));
    expect(spawnInterval(60, C)).toBeLessThan(spawnInterval(30, C));
    expect(spawnInterval(1000, C)).toBe(0.35);
  });

  it('exposure time drops by 0.012 per second and stops at 0.6', () => {
    expect(exposureTime(0, C)).toBeCloseTo(1.4);
    expect(exposureTime(20, C)).toBeCloseTo(1.16);
    expect(exposureTime(66, C)).toBeCloseTo(0.608);
    expect(exposureTime(1000, C)).toBe(0.6);
  });

  it('feature ratio rises 0.3 points per second and caps at 30%', () => {
    expect(featureRatio(0, C)).toBeCloseTo(0.1);
    expect(featureRatio(10, C)).toBeCloseTo(0.13);
    expect(featureRatio(1000, C)).toBe(0.3);
  });

  it('concurrent cap steps up at 30s on 3x3 and 90s on 4x4', () => {
    expect(maxConcurrent(3, 29.9, C)).toBe(2);
    expect(maxConcurrent(3, 30, C)).toBe(3);
    expect(maxConcurrent(4, 89.9, C)).toBe(4);
    expect(maxConcurrent(4, 90, C)).toBe(5);
  });

  it('hard and golden bugs only appear after their unlock times', () => {
    const g = new BugSquashLogic(createRng(4), { startLives: 1e6, maxLives: 1e6, goldenChance: 0.5, hardRatio: 0.5 });
    let firstHard = Infinity;
    let firstGolden = Infinity;
    for (let t = 0; t < 120; t += 0.05) {
      const ev = g.update(0.05);
      for (let i = 0; i < ev.length; i++) {
        const e = ev.at(i);
        if (e.type !== 'spawn') continue;
        if (e.kind === 'hard') firstHard = Math.min(firstHard, g.time);
        if (e.kind === 'golden') firstGolden = Math.min(firstGolden, g.time);
      }
    }
    expect(firstHard).toBeGreaterThanOrEqual(20);
    expect(firstGolden).toBeGreaterThanOrEqual(15);
    expect(firstHard).toBeLessThan(Infinity);
    expect(firstGolden).toBeLessThan(Infinity);
  });

  it('hard bugs stay 1.3x and golden bugs 0.7x as long as a normal bug', () => {
    const g = quiet();
    g.update(10);
    g.forceSpawn(0, 'bug');
    g.forceSpawn(1, 'hard');
    g.forceSpawn(2, 'golden');
    const base = g.getCell(0).duration;
    expect(base).toBeCloseTo(exposureTime(10, C));
    expect(g.getCell(1).duration).toBeCloseTo(base * 1.3);
    expect(g.getCell(2).duration).toBeCloseTo(base * 0.7);
  });
});

describe('determinism', () => {
  function run(seed: number): { log: string[]; state: string } {
    const g = new BugSquashLogic(createRng(seed));
    const input = createRng(777);
    const log: string[] = [];
    for (let f = 0; f < 3000 && !g.isGameOver; f++) {
      const rec = (b: EventBuffer): void => {
        for (let i = 0; i < b.length; i++) {
          const e = b.at(i);
          log.push(`${f}:${e.type}:${e.cell}:${e.kind}:${e.points}:${e.lives}`);
        }
      };
      rec(g.update(0.016));
      if (input() < 0.3) rec(g.tap(Math.floor(input() * g.cellCount)));
    }
    return { log, state: [g.score, g.lives, g.combo, g.maxCombo, g.bugsCaught, g.time.toFixed(6)].join('/') };
  }

  it('same seed and same inputs produce the same events and final state', () => {
    const a = run(42);
    const b = run(42);
    expect(a.log.length).toBeGreaterThan(20);
    expect(a.log).toEqual(b.log);
    expect(a.state).toBe(b.state);
  });

  it('different seeds produce different spawn sequences', () => {
    expect(run(1).log).not.toEqual(run(2).log);
  });
});

describe('frame stability', () => {
  it('a large dt expires objects correctly in one call', () => {
    const g = quiet();
    g.forceSpawn(0, 'bug', 0.3);
    g.forceSpawn(1, 'feature', 0.3);
    const ev = g.update(0.5);
    expect(types(ev)).toEqual(['missed', 'lifeChanged', 'featureExpired']);
    expect(g.lives).toBe(2);
    expect(g.getCell(0).kind).toBeNull();
    expect(g.getCell(1).kind).toBeNull();
    expect(g.time).toBeCloseTo(0.5);
  });

  it('non-finite or non-positive dt is ignored without looping forever', () => {
    const g = quiet();
    g.forceSpawn(0, 'bug', 1);
    expect(g.update(Infinity).length).toBe(0);
    expect(g.update(NaN).length).toBe(0);
    expect(g.update(-1).length).toBe(0);
    expect(g.update(0).length).toBe(0);
    expect(g.time).toBe(0);
    expect(g.getCell(0).kind).toBe('bug');
  });

  it('cell elapsed ratio goes from 0 to 1 over the exposure time', () => {
    const g = quiet();
    g.forceSpawn(0, 'bug', 1);
    expect(g.cellElapsed(0)).toBe(0);
    g.update(0.5);
    expect(g.cellElapsed(0)).toBeCloseTo(0.5);
    expect(g.getCell(0).remaining).toBeCloseTo(0.5);
  });
});
