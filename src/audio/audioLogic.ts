// AudioContext 없이 테스트 가능한 순수 로직.
import type { BugSquashEvent } from '../core/BugSquashLogic';
import { AUDIO_CONFIG } from './audioConfig';
import { REDUCED_END_FADE_DURATION } from '../fxTiming';
import { BGM_SONG, SONG_BARS, STEPS_PER_BAR } from './bgmSong';

export type SoundKind = 'catch' | 'crack' | 'golden' | 'error' | 'miss' | 'expand' | 'gameOver';
/** 재사용 가능한 cue. step은 catch 전용(콤보 음계 스텝). */
export interface SoundCue {
  kind: SoundKind;
  step: number;
}

/** 콤보(1~) → 음계 스텝. 1 미만은 0, 상한 catchMaxStep. */
export function comboToStep(combo: number, maxStep: number = AUDIO_CONFIG.catchMaxStep): number {
  if (!Number.isFinite(combo)) return 0;
  return Math.max(0, Math.min(maxStep, Math.floor(combo) - 1));
}

/** 음계 스텝 → 주파수(Hz). 5음 음계를 옥타브로 이어 붙인다. */
export function stepToFreq(
  step: number,
  base: number = AUDIO_CONFIG.catchBaseFreq,
  scale: readonly number[] = AUDIO_CONFIG.scaleSemitones,
): number {
  const s = Math.max(0, Math.floor(step));
  const octave = Math.floor(s / scale.length);
  const semis = scale[s % scale.length]! + 12 * octave;
  return semitoneToFreq(base, semis);
}

export function semitoneToFreq(base: number, semitones: number): number {
  return base * Math.pow(2, semitones / 12);
}

/**
 * 이벤트 → 소리. out을 채우고 소리가 있으면 true (프레임마다 할당하지 않기 위해 out 재사용).
 * 골든 놓침은 라이프 손실이 없으므로 무음. emptyTap 은 놓침(miss)과 같은 소리. spawn/cleared/lifeChanged 등은 무음.
 */
export function cueForEvent(ev: BugSquashEvent, out: SoundCue): boolean {
  out.step = 0;
  switch (ev.type) {
    case 'caught':
      if (ev.kind === 'golden') out.kind = 'golden';
      else {
        out.kind = 'catch';
        out.step = comboToStep(ev.combo);
      }
      return true;
    case 'hardHit':
      out.kind = 'crack';
      return true;
    case 'emptyTap': // 빈 칸 탭 페널티: 놓침과 같은 소리
    case 'missed':
      if (ev.kind === 'golden') return false;
      out.kind = 'miss';
      return true;
    case 'featureTapped':
      out.kind = 'error';
      return true;
    case 'boardExpand':
      out.kind = 'expand';
      return true;
    case 'gameOver':
      out.kind = 'gameOver';
      return true;
    default:
      return false;
  }
}

/** getItem/setItem만 있으면 되는 최소 스토리지 형태. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 음소거 상태 영속화. 스토리지가 없거나 throw해도 동작한다. */
export class MuteStore {
  constructor(
    private readonly storage: StorageLike | null | undefined,
    private readonly key: string = AUDIO_CONFIG.storageKey,
  ) {}

  load(): boolean {
    try {
      return this.storage?.getItem(this.key) === '1';
    } catch {
      return false;
    }
  }

  save(muted: boolean): void {
    try {
      this.storage?.setItem(this.key, muted ? '1' : '0');
    } catch {
      // 저장 불가 환경: 무시
    }
  }
}

export interface AudioSettings {
  bgmOn: boolean;
  sfxOn: boolean;
  bgmVolume: number;
  sfxVolume: number;
}

export function defaultSettings(): AudioSettings {
  return { ...AUDIO_CONFIG.defaults };
}

/** 0..1로 clamp. NaN/비숫자는 fallback. */
export function clampVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

/** 임의 값 → 유효한 설정. 누락/손상된 필드는 기본값. */
export function sanitizeSettings(raw: unknown): AudioSettings {
  const d = AUDIO_CONFIG.defaults;
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    bgmOn: typeof o.bgmOn === 'boolean' ? o.bgmOn : d.bgmOn,
    sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : d.sfxOn,
    bgmVolume: clampVolume(o.bgmVolume, d.bgmVolume),
    sfxVolume: clampVolume(o.sfxVolume, d.sfxVolume),
  };
}

/** 마스터 이후 BGM/SFX 버스의 실제 gain. 전체 음소거면 둘 다 0. duck은 BGM 배율(0..1). */
export function effectiveGains(s: AudioSettings, muted: boolean, duck = 1): { bgm: number; sfx: number } {
  if (muted) return { bgm: 0, sfx: 0 };
  return {
    bgm: s.bgmOn ? clampVolume(s.bgmVolume, 0) * clampVolume(duck, 1) : 0,
    sfx: s.sfxOn ? clampVolume(s.sfxVolume, 0) : 0,
  };
}

/** 설정 영속화(JSON). 스토리지 없음/throw/손상 JSON이어도 기본값으로 동작. */
export class AudioSettingsStore {
  constructor(
    private readonly storage: StorageLike | null | undefined,
    private readonly key: string = AUDIO_CONFIG.settingsKey,
  ) {}

  load(): AudioSettings {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return defaultSettings();
      return sanitizeSettings(JSON.parse(raw));
    } catch {
      return defaultSettings();
    }
  }

  save(s: AudioSettings): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(s));
    } catch {
      // 저장 불가 환경: 무시
    }
  }
}

export interface BgmLead {
  readonly freq: number;
  readonly steps: number;
  /** AUDIO_CONFIG.bgm.duties 인덱스. */
  readonly duty: number;
}
export interface BgmStep {
  lead: BgmLead | null;
  bass: number | null;
  kick: boolean;
  snare: boolean;
  hat: boolean;
}

export function bgmLoopSteps(): number {
  return STEPS_PER_BAR * SONG_BARS;
}

/** 스텝 길이(초). */
export function bgmStepDuration(bpm: number = BGM_SONG.bpm): number {
  return 60 / bpm / AUDIO_CONFIG.bgm.stepsPerBeat;
}

/** 곡 데이터를 스텝 테이블로 한 번만 펼친다. */
interface MutableStep {
  lead: BgmLead | null;
  bass: number | null;
  kick: boolean;
  snare: boolean;
  hat: boolean;
}
function buildBgmTable(): readonly Readonly<BgmStep>[] {
  const total = bgmLoopSteps();
  const table: MutableStep[] = [];
  for (let i = 0; i < total; i++) table.push({ lead: null, bass: null, kick: false, snare: false, hat: false });
  for (let bar = 0; bar < SONG_BARS; bar++) {
    const base = bar * STEPS_PER_BAR;
    for (const [start, semi, len] of BGM_SONG.lead[bar]!) {
      table[base + start]!.lead = { freq: semitoneToFreq(BGM_SONG.leadBaseFreq, semi), steps: len, duty: BGM_SONG.leadDuty[bar]! };
    }
    const d = BGM_SONG.drums[bar]!;
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const st = table[base + s]!;
      const off = BGM_SONG.bassPattern[s];
      if (off !== null && off !== undefined) st.bass = semitoneToFreq(BGM_SONG.bassBaseFreq, BGM_SONG.bassRoots[bar]! + off);
      st.kick = d.kick[s] === 'x';
      st.snare = d.snare[s] === 'x';
      st.hat = d.hat[s] === 'x';
    }
  }
  return table;
}
const BGM_TABLE = buildBgmTable();

/** 한 보이스의 시작 스텝 시각과 수명(초). */
function voiceLifetimes(st: Readonly<BgmStep>, stepDur: number): number[] {
  const B = AUDIO_CONFIG.bgm;
  const m = AUDIO_CONFIG.stopMargin;
  const out: number[] = [];
  if (st.lead) out.push(st.lead.steps * stepDur * B.lead.gateRatio + m);
  if (st.bass !== null) out.push(B.bass.steps * stepDur * B.bass.gateRatio + m);
  if (st.kick) out.push(B.kick.dur + m);
  if (st.snare) out.push(Math.min(B.snare.dur, AUDIO_CONFIG.noiseDur) + m);
  if (st.hat) out.push(Math.min(B.hat.dur, AUDIO_CONFIG.noiseDur) + m);
  return out;
}

/**
 * 스케줄러가 동시에 세게 되는 BGM 보이스의 최대치(보수적).
 * 보이스는 lookahead만큼 일찍 예약되고 끝날 때까지 카운트되므로,
 * 스텝 i를 예약하는 순간 (시작 <= t_i 이고 끝 > t_i - lookahead)인 보이스를 모두 센다. 루프 이음새를 위해 2루프를 본다.
 */
export function bgmPeakVoices(
  table: readonly Readonly<BgmStep>[] = BGM_TABLE,
  stepDur: number = bgmStepDuration(),
  lookahead: number = AUDIO_CONFIG.bgm.lookahead,
): number {
  const n = table.length;
  const lives = table.map((st) => voiceLifetimes(st, stepDur));
  let peak = 0;
  for (let i = n; i < 2 * n; i++) {
    const t = i * stepDur;
    let count = 0;
    for (let j = 0; j <= i; j++) {
      const l = lives[j % n]!;
      const start = j * stepDur;
      for (let k = 0; k < l.length; k++) if (start + l[k]! > t - lookahead) count++;
    }
    peak = Math.max(peak, count);
  }
  return peak;
}

/** 스텝 인덱스(무한히 증가 가능, 루프 길이로 순환) → 이 스텝에서 낼 음. 공유 객체이므로 수정 금지. */
export function bgmStep(index: number): Readonly<BgmStep> {
  const total = BGM_TABLE.length;
  return BGM_TABLE[((Math.floor(index) % total) + total) % total]!;
}

/**
 * 듀티 d의 펄스파(±1) 푸리에 계수. PeriodicWave용 (DC 제외).
 * a_n = sin(2πnd)/(πn) * 2, b_n = (1 - cos(2πnd))/(πn) * 2.
 */
export function pulseWaveCoeffs(duty: number, harmonics: number): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 * Math.sin(2 * Math.PI * n * duty)) / (Math.PI * n);
    imag[n] = (2 * (1 - Math.cos(2 * Math.PI * n * duty))) / (Math.PI * n);
  }
  return { real, imag };
}

/**
 * 다음 BGM 스텝 시각. prev가 이미 now+startDelay 이후면 유지(이중 예약 방지),
 * 지났거나 첫 시작(prev 없음/비유한)이면 now+startDelay로 재정렬.
 */
export function nextBgmTime(prev: number | null, now: number, startDelay: number): number {
  const floor = now + startDelay;
  if (!Number.isFinite(floor)) return prev !== null && Number.isFinite(prev) ? prev : 0;
  if (prev === null || !Number.isFinite(prev)) return floor;
  return prev < floor ? floor : prev;
}

/** 새 SFX 보이스 시작 허용 여부. */
export function canStartSfxVoice(active: number): boolean {
  return active < AUDIO_CONFIG.maxVoices;
}

/** 게임 오버 소리 길이: reduced motion이면 짧은 페이드, 아니면 CRT 꺼짐 길이. */
export function gameOverSoundDuration(reduced: boolean): number {
  return reduced ? REDUCED_END_FADE_DURATION : AUDIO_CONFIG.gameOver.dur;
}

/** 게임 오버 험 길이: 본 소리보다 길지 않게 제한한다 (기본 모드 0.3초는 그대로). */
export function gameOverHumDuration(reduced: boolean): number {
  return Math.min(AUDIO_CONFIG.gameOver.humDur, gameOverSoundDuration(reduced));
}

/** 듀티 보정 게인: 실제 PeriodicWave를 쓸 때만 dutyGain을 곱하고, 대체 파형('square')이면 1. */
export function pulseGainScale(usedPeriodicWave: boolean, dutyGain: number | undefined): number {
  return usedPeriodicWave ? (dutyGain ?? 1) : 1;
}
