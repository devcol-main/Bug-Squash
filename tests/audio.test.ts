import { describe, expect, it } from 'vitest';
import { AUDIO_CONFIG } from '../src/audio/audioConfig';
import {
  AudioSettingsStore,
  MuteStore,
  bgmLoopSteps,
  bgmPeakVoices,
  semitoneToFreq,
  pulseWaveCoeffs,
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
import { BGM_SONG, SONG_BARS, STEPS_PER_BAR } from '../src/audio/bgmSong';
import { CRT_OFF_DURATION } from '../src/fxTiming';
import { VIEW_CONFIG } from '../src/view/viewConfig';
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
  it('feature tapped maps to the error bell', () => {
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

describe('bgm song data', () => {
  const loop = bgmLoopSteps();
  const scalePcs = new Set(BGM_SONG.scaleSemitones);
  it('tempo is near 150 BPM and the step duration matches it', () => {
    expect(BGM_SONG.bpm).toBeGreaterThanOrEqual(145);
    expect(BGM_SONG.bpm).toBeLessThanOrEqual(155);
    expect(60 / bgmStepDuration() / AUDIO_CONFIG.bgm.stepsPerBeat).toBeCloseTo(BGM_SONG.bpm);
  });
  it('loop is 8 bars of 16 sixteenth-note steps', () => {
    expect(SONG_BARS).toBe(8);
    expect(loop).toBe(8 * 16);
    expect(BGM_SONG.lead.length).toBe(8);
    expect(BGM_SONG.leadDuty.length).toBe(8);
    expect(BGM_SONG.bassRoots.length).toBe(8);
  });
  it('step index past the loop wraps to the same step', () => {
    expect(bgmStep(loop + 3)).toEqual(bgmStep(3));
    expect(bgmStep(-1)).toEqual(bgmStep(loop - 1));
  });
  it('every melody note is inside the scale and fits in its bar', () => {
    for (const bar of BGM_SONG.lead) {
      for (const [start, semi, len] of bar) {
        expect(scalePcs.has(((semi % 12) + 12) % 12)).toBe(true);
        expect(start + len).toBeLessThanOrEqual(STEPS_PER_BAR);
      }
    }
  });
  it('every bar has its own melody pattern, so it is not a repeated arpeggio', () => {
    const sigs = new Set(BGM_SONG.lead.map((b) => JSON.stringify(b)));
    expect(sigs.size).toBe(8);
  });
  it('question phrase and answer phrase differ and the last bar resolves to the tonic', () => {
    expect(JSON.stringify(BGM_SONG.lead.slice(0, 4))).not.toBe(JSON.stringify(BGM_SONG.lead.slice(4)));
    const last = BGM_SONG.lead[7]!;
    expect(last[last.length - 1]![1] % 12).toBe(0);
  });
  it('lead uses both pulse duties across the loop', () => {
    expect(new Set(BGM_SONG.leadDuty)).toEqual(new Set([0, 1]));
    for (const d of BGM_SONG.leadDuty) expect(AUDIO_CONFIG.bgm.duties[d]).toBeDefined();
  });
  it('bass pattern and drum patterns are 16 steps long for every bar', () => {
    expect(BGM_SONG.bassPattern.length).toBe(STEPS_PER_BAR);
    expect(BGM_SONG.drums.length).toBe(SONG_BARS);
    for (const d of BGM_SONG.drums) {
      expect(d.kick.length).toBe(STEPS_PER_BAR);
      expect(d.snare.length).toBe(STEPS_PER_BAR);
      expect(d.hat.length).toBe(STEPS_PER_BAR);
    }
  });
  it('bass stays low and plays on the first step of every bar', () => {
    for (let i = 0; i < loop; i++) {
      const st = bgmStep(i);
      if (st.bass !== null) expect(st.bass).toBeLessThan(250);
    }
    for (let bar = 0; bar < SONG_BARS; bar++) expect(bgmStep(bar * STEPS_PER_BAR).bass).not.toBeNull();
  });
  it('drums include kick, snare and hat hits and the last bar has a fill', () => {
    const steps = Array.from({ length: loop }, (_, i) => bgmStep(i));
    expect(steps.some((s) => s.kick)).toBe(true);
    expect(steps.some((s) => s.snare)).toBe(true);
    expect(steps.some((s) => s.hat)).toBe(true);
    const snares = (bar: number): number => steps.slice(bar * 16, bar * 16 + 16).filter((s) => s.snare).length;
    expect(snares(7)).toBeGreaterThan(snares(0));
  });
  it('bgmStep for a note in bar 3 matches the song data (lead steps, duty, bass frequency)', () => {
    const bar = 3;
    const [start, semi, len] = BGM_SONG.lead[bar]![1]!;
    const st = bgmStep(bar * STEPS_PER_BAR + start);
    expect(st.lead?.steps).toBe(len);
    expect(st.lead?.duty).toBe(BGM_SONG.leadDuty[bar]);
    expect(st.lead?.freq).toBeCloseTo(BGM_SONG.leadBaseFreq * 2 ** (semi / 12));
    const bassStep = 8; // 옥타브 오프셋(+12)이 있는 스텝
    const off = BGM_SONG.bassPattern[bassStep]!;
    expect(bgmStep(bar * STEPS_PER_BAR + bassStep).bass).toBeCloseTo(BGM_SONG.bassBaseFreq * 2 ** ((BGM_SONG.bassRoots[bar]! + off) / 12));
    expect(semitoneToFreq(BGM_SONG.bassBaseFreq, 0)).toBe(BGM_SONG.bassBaseFreq);
  });
});

describe('pulseWaveCoeffs', () => {
  const expectedReal = (d: number, n: number): number => (2 * Math.sin(2 * Math.PI * n * d)) / (Math.PI * n);
  const expectedImag = (d: number, n: number): number => (2 * (1 - Math.cos(2 * Math.PI * n * d))) / (Math.PI * n);
  it('duty 0.125 and 0.25 first harmonics match the Fourier formula', () => {
    for (const d of [0.125, 0.25]) {
      const { real, imag } = pulseWaveCoeffs(d, 8);
      for (let n = 1; n <= 8; n++) {
        expect(real[n]).toBeCloseTo(expectedReal(d, n), 5);
        expect(imag[n]).toBeCloseTo(expectedImag(d, n), 5);
      }
    }
  });
  it('duty 0.25 has no 4th harmonic cosine term and duty 0.125 has no 8th', () => {
    expect(Math.abs(pulseWaveCoeffs(0.25, 8).real[4]!)).toBeLessThan(1e-6);
    expect(Math.abs(pulseWaveCoeffs(0.125, 8).real[8]!)).toBeLessThan(1e-6);
  });
  it('duty 0.5 reduces to a square wave with only odd sine harmonics', () => {
    const { real, imag } = pulseWaveCoeffs(0.5, 6);
    expect(imag[1]).toBeCloseTo(4 / Math.PI, 5);
    expect(imag[2]).toBeCloseTo(0, 5);
    expect(imag[3]).toBeCloseTo(4 / (3 * Math.PI), 5);
    for (let n = 1; n <= 6; n++) expect(real[n]).toBeCloseTo(0, 5);
  });
  it('coefficient arrays have DC at zero and length harmonics + 1', () => {
    const { real, imag } = pulseWaveCoeffs(0.25, 32);
    expect(real.length).toBe(33);
    expect(imag.length).toBe(33);
    expect(real[0]).toBe(0);
    expect(imag[0]).toBe(0);
  });
});

describe('sfx design', () => {
  it('game over sound length equals the CRT power-off visual duration', () => {
    expect(AUDIO_CONFIG.gameOver.dur).toBe(VIEW_CONFIG.fx.crtOffDuration);
    expect(AUDIO_CONFIG.gameOver.dur).toBe(CRT_OFF_DURATION);
  });
  it('typing click train fits inside the shared noise buffer', () => {
    const x = AUDIO_CONFIG.expand;
    expect((x.clicks - 1) * x.clickGap + x.clickDur).toBeLessThan(AUDIO_CONFIG.noiseDur);
  });
  it('duty gain table has one entry per duty and boosts the thinner pulse', () => {
    expect(AUDIO_CONFIG.bgm.dutyGain.length).toBe(AUDIO_CONFIG.bgm.duties.length);
    expect(AUDIO_CONFIG.bgm.dutyGain[0]).toBeGreaterThan(AUDIO_CONFIG.bgm.dutyGain[1]!);
  });
});

describe('bgm voice budget', () => {
  it('voice cap leaves at least 4 voices of headroom above the computed song peak', () => {
    const peak = bgmPeakVoices();
    expect(peak).toBeGreaterThan(0);
    expect(peak + 4).toBeLessThanOrEqual(AUDIO_CONFIG.bgm.maxVoices);
  });
  it('peak calculation grows with the lookahead window', () => {
    expect(bgmPeakVoices(undefined, undefined, 1)).toBeGreaterThan(bgmPeakVoices(undefined, undefined, 0.1));
  });
  it('a single long lead note and nothing else peaks at one voice', () => {
    const empty = { lead: { freq: 440, steps: 4, duty: 0 }, bass: null, kick: false, snare: false, hat: false };
    const table = [empty, ...Array.from({ length: 31 }, () => ({ lead: null, bass: null, kick: false, snare: false, hat: false }))];
    expect(bgmPeakVoices(table, 0.1, 0)).toBe(1);
  });
});

describe('nextBgmTime', () => {
  it('first start aligns to now plus the delay', () => expect(nextBgmTime(null, 10, 0.1)).toBeCloseTo(10.1));
  it('already scheduled ahead keeps the previous time', () => expect(nextBgmTime(10.3, 10, 0.1)).toBe(10.3));
  it('previous time already passed re-aligns to now plus the delay', () => expect(nextBgmTime(9, 10, 0.1)).toBeCloseTo(10.1));
  it('non-finite now never returns NaN', () => expect(Number.isFinite(nextBgmTime(null, NaN, 0.1))).toBe(true));
});
