import { describe, expect, it } from 'vitest';
import { AUDIO_CONFIG } from '../src/audio/audioConfig';
import {
  AudioSettingsStore,
  MuteStore,
  bgmLoopSteps,
  bgmStep,
  bgmStepDuration,
  comboToStep,
  cueForEvent,
  defaultSettings,
  effectiveGains,
  nextBgmTime,
  sanitizeSettings,
  stepToFreq,
  type SoundCue,
  type StorageLike,
} from '../src/audio/audioLogic';
import type { BugSquashEvent } from '../src/core/BugSquashLogic';

const ev = (over: Partial<BugSquashEvent>): BugSquashEvent => ({
  type: 'spawn', cell: 0, kind: 'bug', points: 0, multiplier: 1, combo: 0, lives: 3, lifeDelta: 0, ...over,
});
const cue = (over: Partial<BugSquashEvent>): SoundCue | null => {
  const out: SoundCue = { kind: 'catch', step: 0 };
  return cueForEvent(ev(over), out) ? { ...out } : null;
};

describe('cueForEvent', () => {
  it('normal bug caught maps to the catch sound with a combo step', () => {
    expect(cue({ type: 'caught', kind: 'bug', combo: 3 })).toEqual({ kind: 'catch', step: 2 });
  });
  it('hard bug final hit maps to the catch sound', () => {
    expect(cue({ type: 'caught', kind: 'hard', combo: 1 })?.kind).toBe('catch');
  });
  it('golden caught maps to the golden sound', () => {
    expect(cue({ type: 'caught', kind: 'golden', combo: 5 })?.kind).toBe('golden');
  });
  it('hard bug first hit maps to the crack sound', () => {
    expect(cue({ type: 'hardHit', kind: 'hard' })?.kind).toBe('crack');
  });
  it('feature tapped maps to the error buzzer', () => {
    expect(cue({ type: 'featureTapped', kind: 'feature', lifeDelta: -1 })?.kind).toBe('error');
  });
  it('missed bug maps to the miss sound', () => {
    expect(cue({ type: 'missed', kind: 'bug', lifeDelta: -1 })?.kind).toBe('miss');
  });
  it('missed golden stays silent because no life is lost', () => {
    expect(cue({ type: 'missed', kind: 'golden' })).toBeNull();
  });
  it('board expand and game over map to their own sounds', () => {
    expect(cue({ type: 'boardExpand', kind: null })?.kind).toBe('expand');
    expect(cue({ type: 'gameOver', kind: null })?.kind).toBe('gameOver');
  });
  it('silent event types produce no cue', () => {
    for (const type of ['spawn', 'featureExpired', 'emptyTap', 'cleared', 'lifeChanged', 'comboReset', 'multiplierUp'] as const) {
      expect(cue({ type })).toBeNull();
    }
  });
  it('hardHit after a combo-5 catch resets the reused cue step and kind', () => {
    const out: SoundCue = { kind: 'miss', step: 0 };
    expect(cueForEvent(ev({ type: 'caught', kind: 'bug', combo: 5 }), out)).toBe(true);
    expect(out).toEqual({ kind: 'catch', step: 4 });
    expect(cueForEvent(ev({ type: 'hardHit', kind: 'hard' }), out)).toBe(true);
    expect(out).toEqual({ kind: 'crack', step: 0 });
  });
  it('missed golden returns false and leaves the kind untouched while clearing the step', () => {
    const out: SoundCue = { kind: 'catch', step: 4 };
    expect(cueForEvent(ev({ type: 'missed', kind: 'golden' }), out)).toBe(false);
    expect(out).toEqual({ kind: 'catch', step: 0 });
  });
});

describe('combo pitch', () => {
  it('combo 1 maps to the lowest step', () => expect(comboToStep(1)).toBe(0));
  it('frequency rises with each combo up to the cap', () => {
    for (let c = 2; c <= AUDIO_CONFIG.catchMaxStep + 1; c++) {
      expect(stepToFreq(comboToStep(c))).toBeGreaterThan(stepToFreq(comboToStep(c - 1)));
    }
  });
  it('combo above the cap stays at the max step and frequency', () => {
    expect(comboToStep(999)).toBe(AUDIO_CONFIG.catchMaxStep);
    expect(stepToFreq(comboToStep(999))).toBe(stepToFreq(comboToStep(AUDIO_CONFIG.catchMaxStep + 1)));
  });
  it('zero, negative or NaN combo falls back to step 0', () => {
    expect(comboToStep(0)).toBe(0);
    expect(comboToStep(-3)).toBe(0);
    expect(comboToStep(NaN)).toBe(0);
  });
});

const mem = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const throwing: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('audio storage', () => {
  it('storage keys are Bug Squash specific and do not collide with Stack Up', () => {
    expect(AUDIO_CONFIG.storageKey).toBe('bugSquash.audio.muted');
    expect(AUDIO_CONFIG.settingsKey).toBe('bugSquash.audio.settings');
    expect(AUDIO_CONFIG.storageKey).not.toBe(AUDIO_CONFIG.settingsKey);
    expect(AUDIO_CONFIG.storageKey.startsWith('stackup')).toBe(false);
    expect(AUDIO_CONFIG.settingsKey.startsWith('stackup')).toBe(false);
  });
  it('saved muted state is restored by a new store under the Bug Squash key', () => {
    const s = mem();
    new MuteStore(s).save(true);
    expect(s.data.has('bugSquash.audio.muted')).toBe(true);
    expect(new MuteStore(s).load()).toBe(true);
  });
  it('nothing stored loads as not muted', () => expect(new MuteStore(mem()).load()).toBe(false));
  it('mute store on throwing or null storage neither crashes nor mutes', () => {
    for (const st of [throwing, null]) {
      const store = new MuteStore(st);
      expect(() => store.save(true)).not.toThrow();
      expect(store.load()).toBe(false);
    }
  });
  it('saved settings are restored by a new store', () => {
    const s = mem();
    const v = { bgmOn: false, sfxOn: true, bgmVolume: 0.2, sfxVolume: 0.5 };
    new AudioSettingsStore(s).save(v);
    expect(s.data.has('bugSquash.audio.settings')).toBe(true);
    expect(new AudioSettingsStore(s).load()).toEqual(v);
  });
  it('settings on throwing or null storage fall back to defaults without crashing', () => {
    for (const st of [throwing, null]) {
      const store = new AudioSettingsStore(st);
      expect(() => store.save(defaultSettings())).not.toThrow();
      expect(store.load()).toEqual(AUDIO_CONFIG.defaults);
    }
  });
  it('corrupt JSON or wrong-typed JSON loads the defaults', () => {
    for (const raw of ['{not json', '42']) {
      const s = mem();
      s.setItem(AUDIO_CONFIG.settingsKey, raw);
      expect(new AudioSettingsStore(s).load()).toEqual(AUDIO_CONFIG.defaults);
    }
  });
  it('out of range and NaN volumes are clamped or defaulted', () => {
    expect(sanitizeSettings({ bgmOn: 'yes', sfxOn: false, bgmVolume: 5, sfxVolume: -1 })).toEqual({
      bgmOn: true, sfxOn: false, bgmVolume: 1, sfxVolume: 0,
    });
    expect(sanitizeSettings({ bgmVolume: NaN }).bgmVolume).toBe(AUDIO_CONFIG.defaults.bgmVolume);
  });
});

describe('effectiveGains', () => {
  const base = { bgmOn: true, sfxOn: true, bgmVolume: 0.4, sfxVolume: 0.8 };
  it('global mute silences both buses', () => expect(effectiveGains(base, true)).toEqual({ bgm: 0, sfx: 0 }));
  it('ducking scales only the BGM gain', () => {
    const g = effectiveGains(base, false, 0.25);
    expect(g.bgm).toBeCloseTo(0.1);
    expect(g.sfx).toBe(0.8);
  });
});

describe('bgm pattern', () => {
  const loop = bgmLoopSteps();
  it('tempo is faster than Stack Up (108 BPM)', () => {
    expect(AUDIO_CONFIG.bgm.bpm).toBeGreaterThan(108);
    expect(60 / bgmStepDuration() / AUDIO_CONFIG.bgm.stepsPerBeat).toBeCloseTo(AUDIO_CONFIG.bgm.bpm);
  });
  it('step index past the loop wraps to the same step', () => {
    expect(bgmStep(loop + 3)).toEqual(bgmStep(3));
    expect(bgmStep(-1)).toEqual(bgmStep(loop - 1));
  });
  it('arpeggio notes stay inside the scale and bass stays low', () => {
    const allowed = new Set(AUDIO_CONFIG.bgm.scaleSemitones.map((x) => x % 12));
    let notes = 0;
    for (let i = 0; i < loop; i++) {
      const st = bgmStep(i);
      if (st.arp !== null) {
        notes++;
        expect(allowed.has(Math.round(12 * Math.log2(st.arp / AUDIO_CONFIG.bgm.baseFreq)) % 12)).toBe(true);
      }
      if (st.bass !== null) expect(st.bass).toBeLessThan(200);
    }
    expect(notes).toBeGreaterThan(0);
  });
  it('bass plays on the first beat of every bar', () => {
    for (let bar = 0; bar < AUDIO_CONFIG.bgm.bars; bar++) expect(bgmStep(bar * AUDIO_CONFIG.bgm.stepsPerBar).bass).not.toBeNull();
  });
});

describe('nextBgmTime', () => {
  it('first start aligns to now plus the delay', () => expect(nextBgmTime(null, 10, 0.1)).toBeCloseTo(10.1));
  it('already scheduled ahead keeps the previous time', () => expect(nextBgmTime(10.3, 10, 0.1)).toBe(10.3));
  it('previous time already passed re-aligns to now plus the delay', () => expect(nextBgmTime(9, 10, 0.1)).toBeCloseTo(10.1));
  it('non-finite now never returns NaN', () => expect(Number.isFinite(nextBgmTime(null, NaN, 0.1))).toBe(true));
});
