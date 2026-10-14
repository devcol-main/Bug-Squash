import type { BugSquashEvent, EventBuffer } from '../core/BugSquashLogic';
import { AUDIO_CONFIG as C } from './audioConfig';
import {
  AudioSettingsStore,
  bgmStep,
  bgmStepDuration,
  canStartSfxVoice,
  cueForEvent,
  nextBgmTime,
  effectiveGains,
  clampVolume,
  MuteStore,
  semitoneToFreq,
  stepToFreq,
  type AudioSettings,
  type SoundCue,
  type StorageLike,
} from './audioLogic';

type AudioCtor = typeof AudioContext;

function getStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 구형 환경은 Promise를 반환하지 않을 수 있다. */
function swallow(p: Promise<void> | undefined): void {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private readonly cue: SoundCue = { kind: 'catch', step: 0 };
  private muted: boolean;
  private readonly store: MuteStore;
  private readonly settingsStore: AudioSettingsStore;
  private settings: AudioSettings;
  private ducked = false;
  private readonly listeners = new Set<(s: Readonly<AudioSettings>) => void>();
  // BGM 스케줄러 상태
  private bgmTimer: ReturnType<typeof setInterval> | null = null;
  private bgmVoices = 0;
  private bgmStepIndex = 0;
  private bgmNextTime: number | null = null;
  private readonly bgmStepDur = bgmStepDuration();
  private readonly bgmTick = (): void => this.scheduleBgm();

  constructor(storage: StorageLike | null = getStorage()) {
    this.store = new MuteStore(storage);
    this.muted = this.store.load();
    this.settingsStore = new AudioSettingsStore(storage);
    this.settings = this.settingsStore.load();
  }

  /**
   * 첫 사용자 입력 핸들러에서 호출. 이후 호출은 resume만 수행.
   * 주의: touch의 pointerdown은 user activation이 아니어서 iOS에서는 pointerup/touchend에서도 시도해야 한다.
   */
  /** AudioContext를 쓸 수 없는 환경이면 false (호출 쪽이 언락 리스너를 해제할 수 있게). */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const Ctor: AudioCtor | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (!Ctor) return false;
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = C.masterGain;
        master.connect(ctx.destination);
        const bgmBus = ctx.createGain();
        const sfxBus = ctx.createGain();
        const g = effectiveGains(this.settings, this.muted, this.ducked ? C.duckFactor : 1);
        bgmBus.gain.value = g.bgm;
        sfxBus.gain.value = g.sfx;
        bgmBus.connect(master);
        sfxBus.connect(master);
        this.ctx = ctx;
        this.bgmBus = bgmBus;
        this.sfxBus = sfxBus;
        this.noise = this.makeNoise(ctx);
      }
      if (this.ctx.state !== 'running') {
        // iOS: running이 아니면 입력 핸들러마다 무음 버퍼를 다시 재생해 언락을 재시도
        const b = this.ctx.createBuffer(1, 1, C.silentBufferRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        swallow(this.ctx.resume());
      }
      this.syncBgm();
      return true;
    } catch {
      // 오디오 사용 불가: 무음으로 진행
      return false;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.store.save(m);
    this.applyGains(C.muteRamp);
    this.syncBgm();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** 현재 설정의 사본. 옵션 UI는 이 값을 읽는다. */
  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setBgmOn(on: boolean): void {
    this.updateSettings({ ...this.settings, bgmOn: on });
  }

  setSfxOn(on: boolean): void {
    this.updateSettings({ ...this.settings, sfxOn: on });
  }

  setBgmVolume(v: number): void {
    this.updateSettings({ ...this.settings, bgmVolume: clampVolume(v, this.settings.bgmVolume) });
  }

  setSfxVolume(v: number): void {
    this.updateSettings({ ...this.settings, sfxVolume: clampVolume(v, this.settings.sfxVolume) });
  }

  /** 설정이 바뀔 때마다 호출. 반환 함수로 해제. */
  onSettingsChange(fn: (s: Readonly<AudioSettings>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 게임 오버: BGM 볼륨을 낮춘다. onEvent의 gameOver에서도 자동 호출된다. */
  duck(): void {
    this.ducked = true;
    this.applyGains(C.duckRamp);
  }

  /** 재시작: BGM 볼륨 복귀. */
  unduck(): void {
    this.ducked = false;
    this.applyGains(C.duckRamp);
  }

  private updateSettings(next: AudioSettings): void {
    const a = this.settings;
    if (a.bgmOn === next.bgmOn && a.sfxOn === next.sfxOn && a.bgmVolume === next.bgmVolume && a.sfxVolume === next.sfxVolume) return;
    this.settings = next;
    this.settingsStore.save(next);
    this.applyGains(C.settingsRamp);
    this.syncBgm();
    for (const fn of this.listeners) {
      try {
        fn(this.settings);
      } catch {
        // 리스너 하나의 오류가 다른 리스너 통지를 막지 않게
      }
    }
  }

  private applyGains(ramp: number): void {
    if (!this.ctx || !this.bgmBus || !this.sfxBus) return;
    const g = effectiveGains(this.settings, this.muted, this.ducked ? C.duckFactor : 1);
    const t = this.ctx.currentTime;
    this.bgmBus.gain.setTargetAtTime(g.bgm, t, ramp);
    this.sfxBus.gain.setTargetAtTime(g.sfx, t, ramp);
  }

  /** 탭 숨김 등. unlock 전이면 무시. 스케줄러 타이머도 멈춘다. */
  suspend(): void {
    this.stopBgmTimer();
    if (this.ctx && this.ctx.state === 'running') swallow(this.ctx.suspend());
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') swallow(this.ctx.resume());
    this.syncBgm();
  }

  // ---- BGM: lookahead 스케줄러 (프레임 루프와 무관한 setInterval) ----

  /** BGM이 들려야 하는 상태면 타이머 시작, 아니면 정지. */
  private syncBgm(): void {
    const should = !!this.ctx && !this.muted && this.settings.bgmOn && !(typeof document !== 'undefined' && document.hidden);
    if (should) this.startBgmTimer();
    else this.stopBgmTimer();
  }

  private startBgmTimer(): void {
    if (this.bgmTimer !== null || !this.ctx) return;
    this.bgmNextTime = nextBgmTime(this.bgmNextTime, this.ctx.currentTime, C.bgm.startDelay);
    this.bgmTimer = setInterval(this.bgmTick, C.bgm.tickMs);
    this.scheduleBgm();
  }

  private stopBgmTimer(): void {
    if (this.bgmTimer === null) return;
    clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  private scheduleBgm(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return; // 정지 중에는 currentTime이 멈춰 있어 쌓이지 않는다
    const now = ctx.currentTime;
    let next = nextBgmTime(this.bgmNextTime, now, 0); // 이미 지난 경우에만 재정렬(따라잡지 않음)
    while (next < now + C.bgm.lookahead) {
      const st = bgmStep(this.bgmStepIndex);
      const t = next;
      if (st.arp !== null) this.bgmTone(C.bgm.arp, st.arp, t);
      if (st.bass !== null) this.bgmTone(C.bgm.bass, st.bass, t);
      if (st.hat) this.bgmHat(t);
      this.bgmStepIndex++;
      next += this.bgmStepDur;
    }
    this.bgmNextTime = next;
  }

  private bgmTone(p: { type: OscillatorType; gain: number; dur: number; filterFreq: number }, freq: number, t0: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus || this.bgmVoices >= C.bgm.maxVoices) return;
    const t1 = t0 + p.dur;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = p.type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p.gain, t0 + C.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.bgmBus);
    this.bgmVoices++;
    osc.onended = () => {
      this.bgmVoices--;
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    osc.start(t0);
    osc.stop(t1 + C.stopMargin);
  }

  private bgmHat(t0: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus || !this.noise || this.bgmVoices >= C.bgm.maxVoices) return;
    const t1 = t0 + C.bgm.hat.dur;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = C.bgm.hat.filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(C.bgm.hat.gain, t0 + C.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.bgmBus);
    this.bgmVoices++;
    src.onended = () => {
      this.bgmVoices--;
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(t0);
    src.stop(t1 + C.stopMargin);
  }

  /** core 이벤트 버퍼 → 소리. 버퍼는 이 호출 안에서만 읽는다. 이벤트가 없으면 아무 일도 하지 않는다. */
  consume(buf: EventBuffer): void {
    for (let i = 0; i < buf.length; i++) this.onEvent(buf.at(i));
  }

  /** core 이벤트 하나 → 소리. unlock 전/음소거면 무시. */
  onEvent(ev: BugSquashEvent): void {
    if (ev.type === 'gameOver') this.duck();
    if (!this.ctx || this.muted || !this.settings.sfxOn || this.ctx.state !== 'running') return;
    if (cueForEvent(ev, this.cue)) this.play(this.cue);
  }

  private play(cue: SoundCue): void {
    switch (cue.kind) {
      case 'catch': {
        const f = stepToFreq(cue.step);
        const c = C.catchTone;
        this.tone(c.type, f, f, c.dur, c.gain);
        this.tone(C.harmonicType, f * 2, f * 2, c.dur * C.harmonicDurRatio, c.harmonicGain);
        break;
      }
      case 'crack': {
        const k = C.crack;
        this.noiseBurst(k.noiseDur, k.noiseGain, k.noiseFilterFreq);
        this.tone(k.clickType, k.clickFreq, k.clickEndFreq, k.clickDur, k.clickGain);
        break;
      }
      case 'golden': {
        const g = C.golden;
        for (let i = 0; i < g.notes.length; i++) {
          const f = semitoneToFreq(g.baseFreq, g.notes[i]!);
          this.tone(g.type, f, f, g.dur, g.gain, i * g.stepDelay);
        }
        const top = semitoneToFreq(g.baseFreq, g.notes[g.notes.length - 1]! + 12);
        this.tone(g.type, top, top, g.dur, g.sparkleGain, (g.notes.length - 1) * g.stepDelay);
        break;
      }
      case 'error': {
        const e = C.error;
        for (let i = 0; i < e.count; i++) this.tone(e.type, e.freq, e.endFreq, e.dur, e.gain, i * e.gap, e.filterFreq);
        break;
      }
      case 'miss':
        this.tone(C.miss.type, C.miss.freq, C.miss.endFreq, C.miss.dur, C.miss.gain);
        break;
      case 'expand':
        this.tone(C.expand.type, C.expand.freq, C.expand.endFreq, C.expand.dur, C.expand.gain, 0, C.expand.filterFreq);
        break;
      case 'gameOver': {
        const g = C.gameOver;
        for (let i = 0; i < g.notes.length; i++) {
          const f = semitoneToFreq(g.baseFreq, g.notes[i]!);
          this.tone(g.type, f, f * g.endRatio, g.dur, g.gain, i * g.stepDelay, g.filterFreq);
        }
        break;
      }
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0, lowpass = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !canStartSfxVoice(this.voices)) return;
    const t0 = ctx.currentTime + delay;
    const t1 = t0 + dur;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + C.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    let tail: AudioNode = osc;
    let filter: BiquadFilterNode | null = null;
    if (lowpass > 0) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(g);
    g.connect(this.sfxBus);
    this.voices++;
    osc.onended = () => {
      this.voices--;
      osc.disconnect();
      filter?.disconnect();
      g.disconnect();
    };
    osc.start(t0);
    osc.stop(t1 + C.stopMargin);
  }

  private noiseBurst(dur: number, gain: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise || !canStartSfxVoice(this.voices)) return;
    const t0 = ctx.currentTime;
    const t1 = t0 + dur;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + C.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(t0);
    src.stop(t1 + C.stopMargin);
  }

  /** 공유 노이즈 버퍼 (1회 생성, 고정 시드 LCG로 결정적). */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * C.noiseDur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 0xffffffff) * 2 - 1;
    }
    return buf;
  }
}
