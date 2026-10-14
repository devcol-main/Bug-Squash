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
  pulseWaveCoeffs,
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
  /** 듀티별 펄스 PeriodicWave (C.bgm.duties 순서). 언락 때 한 번만 만든다. */
  private waves: PeriodicWave[] = [];
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
        this.waves = this.makeWaves(ctx);
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
    const B = C.bgm;
    while (next < now + B.lookahead) {
      const st = bgmStep(this.bgmStepIndex);
      const t = next;
      if (st.lead) this.bgmLead(st.lead.freq, st.lead.steps * this.bgmStepDur * B.lead.gateRatio, st.lead.duty, t);
      if (st.bass !== null) this.bgmBass(st.bass, t);
      if (st.kick) this.bgmKick(t);
      if (st.snare) this.bgmNoise(t, B.snare.dur, B.snare.gain, 'bandpass', B.snare.filterFreq, B.snare.q);
      if (st.hat) this.bgmNoise(t, B.hat.dur, B.hat.gain, 'highpass', B.hat.filterFreq, 0.7);
      this.bgmStepIndex++;
      next += this.bgmStepDur;
    }
    this.bgmNextTime = next;
  }

  private bgmLead(freq: number, dur: number, duty: number, t0: number): void {
    const wave = this.waves[duty];
    const L = C.bgm.lead;
    const v = wave ? this.osc(wave, t0, t0 + dur, true) : null;
    if (!v) return;
    v.osc.frequency.value = freq;
    v.g.gain.setValueAtTime(0.0001, t0);
    const peak = L.gain * (C.bgm.dutyGain[duty] ?? 1);
    v.g.gain.linearRampToValueAtTime(peak, t0 + L.attack);
    v.g.gain.exponentialRampToValueAtTime(peak * L.sustainRatio, t0 + dur * 0.5);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  private bgmBass(freq: number, t0: number): void {
    const b = C.bgm.bass;
    const dur = b.steps * this.bgmStepDur * b.gateRatio;
    const v = this.osc(b.type, t0, t0 + dur, true);
    if (!v) return;
    v.osc.frequency.value = freq;
    v.g.gain.setValueAtTime(0.0001, t0);
    v.g.gain.exponentialRampToValueAtTime(b.gain, t0 + C.attack);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  private bgmKick(t0: number): void {
    const k = C.bgm.kick;
    const v = this.osc('sine', t0, t0 + k.dur, true);
    if (!v) return;
    v.osc.frequency.setValueAtTime(k.freq, t0);
    v.osc.frequency.exponentialRampToValueAtTime(k.endFreq, t0 + k.dur);
    v.g.gain.setValueAtTime(k.gain, t0);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t0 + k.dur);
  }

  private bgmNoise(t0: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q: number): void {
    const v = this.noiseVoice(t0, dur, type, freq, q, true);
    if (!v) return;
    v.g.gain.setValueAtTime(0.0001, t0);
    v.g.gain.exponentialRampToValueAtTime(gain, t0 + 0.002);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
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

  // ---- SFX (노드 수: 잡기 7, 1타 2, 골든 2, 에러 2, 놓침 2, 확장 5, 게임 오버 4) ----

  private play(cue: SoundCue): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    switch (cue.kind) {
      case 'catch': {
        const c = C.catch;
        // 콤보 피드백인 블립을 먼저 만든다 (보이스 상한에 걸리면 클릭/틱이 먼저 버려진다).
        const f = stepToFreq(cue.step);
        const blip = this.osc(this.waves[c.blipDuty] ?? 'square', t0, t0 + c.blipDur, false);
        if (blip) {
          blip.osc.frequency.value = f;
          this.envelope(blip.g, t0, c.blipDur, c.blipGain * C.bgm.dutyGain[c.blipDuty]!);
        }
        this.clicks(t0, 1, 0, c.clickDur, c.clickGain, c.clickFilterFreq);
        const tick = this.osc('square', t0, t0 + c.tickDur, false);
        if (tick) {
          tick.osc.frequency.value = c.tickFreq;
          this.envelope(tick.g, t0, c.tickDur, c.tickGain);
        }
        break;
      }
      case 'crack': {
        const k = C.crack;
        const v = this.osc(this.waves[k.duty] ?? 'square', t0, t0 + k.dur, false);
        if (!v) break;
        // 계단식 랜덤 주파수. audio는 core가 아니므로 Math.random 허용.
        const stepDur = k.dur / k.steps;
        for (let i = 0; i < k.steps; i++) {
          v.osc.frequency.setValueAtTime(k.minFreq + Math.random() * (k.maxFreq - k.minFreq), t0 + i * stepDur);
        }
        this.envelope(v.g, t0, k.dur, k.gain * C.bgm.dutyGain[k.duty]!);
        break;
      }
      case 'golden': {
        const g = C.golden;
        const n = g.notes.length;
        const dur = (n - 1) * g.stepDelay + g.lastHold;
        const v = this.osc(this.waves[g.duty] ?? 'square', t0, t0 + dur, false);
        if (!v) break;
        for (let i = 0; i < n; i++) v.osc.frequency.setValueAtTime(semitoneToFreq(g.baseFreq, g.notes[i]!), t0 + i * g.stepDelay);
        this.envelope(v.g, t0, dur, g.gain * C.bgm.dutyGain[g.duty]!);
        break;
      }
      case 'error': {
        const e = C.error;
        const dur = e.count * e.dur + (e.count - 1) * e.gap;
        const v = this.osc(e.type, t0, t0 + dur, false);
        if (!v) break;
        v.osc.frequency.value = e.freq;
        // 한 게인에서 비프를 끊어 쓴다 (노드 절약).
        v.g.gain.setValueAtTime(0.0001, t0);
        for (let i = 0; i < e.count; i++) {
          const s = t0 + i * (e.dur + e.gap);
          v.g.gain.setValueAtTime(e.gain, s + C.attack);
          v.g.gain.setValueAtTime(0.0001, s + e.dur);
        }
        break;
      }
      case 'miss': {
        const m = C.miss;
        const v = this.osc(m.type, t0, t0 + m.dur, false);
        if (!v) break;
        v.osc.frequency.setValueAtTime(m.freq, t0);
        v.osc.frequency.exponentialRampToValueAtTime(m.endFreq, t0 + m.dur);
        this.envelope(v.g, t0, m.dur, m.gain);
        break;
      }
      case 'expand': {
        const x = C.expand;
        const v = this.osc(this.waves[x.duty] ?? 'square', t0, t0 + x.dur, false);
        if (v) {
          v.osc.frequency.setValueAtTime(x.freq, t0);
          v.osc.frequency.exponentialRampToValueAtTime(x.endFreq, t0 + x.dur);
          this.envelope(v.g, t0, x.dur, x.gain * C.bgm.dutyGain[x.duty]!);
        }
        this.clicks(t0, x.clicks, x.clickGap, x.clickDur, x.clickGain, x.clickFilterFreq);
        break;
      }
      case 'gameOver': {
        const o = C.gameOver;
        const v = this.osc(o.type, t0, t0 + o.dur, false);
        if (v) {
          v.osc.frequency.setValueAtTime(o.freq, t0);
          v.osc.frequency.exponentialRampToValueAtTime(o.endFreq, t0 + o.dur);
          v.g.gain.setValueAtTime(o.gain, t0);
          v.g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
        }
        const hum = this.osc('sine', t0, t0 + o.humDur, false);
        if (hum) {
          hum.osc.frequency.value = o.humFreq;
          this.envelope(hum.g, t0, o.humDur, o.humGain);
        }
        break;
      }
    }
  }

  /** 어택 후 지수 감쇠 엔벨로프. */
  private envelope(g: GainNode, t0: number, dur: number, gain: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + C.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  /** 노이즈 소스 하나로 키보드 클릭 count번 (gap 간격). 노드 3개. */
  private clicks(t0: number, count: number, gap: number, dur: number, gain: number, freq: number): void {
    const total = (count - 1) * gap + dur;
    const v = this.noiseVoice(t0, total, 'highpass', freq, 0.7, false);
    if (!v) return;
    v.g.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i < count; i++) {
      const s = t0 + i * gap;
      v.g.gain.setValueAtTime(gain, s + 0.001);
      v.g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    }
  }

  /** 오실레이터 + 게인 보이스 (bus에 연결). 보이스 상한이면 null. 끝나면 노드를 정리한다. */
  private osc(wave: OscillatorType | PeriodicWave, t0: number, t1: number, bgm: boolean): { osc: OscillatorNode; g: GainNode } | null {
    const ctx = this.ctx;
    const bus = bgm ? this.bgmBus : this.sfxBus;
    if (!ctx || !bus || !this.canVoice(bgm)) return null;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (typeof wave === 'string') osc.type = wave as OscillatorType; // typeof 분기: 구형 webkit에는 PeriodicWave 전역이 없을 수 있다
    else osc.setPeriodicWave(wave);
    osc.connect(g);
    g.connect(bus);
    this.addVoice(bgm, 1);
    osc.onended = () => {
      this.addVoice(bgm, -1);
      osc.disconnect();
      g.disconnect();
    };
    osc.start(t0);
    osc.stop(t1 + C.stopMargin);
    return { osc, g };
  }

  /** 공유 노이즈 버퍼 + 필터 + 게인 보이스. 노드 3개. */
  private noiseVoice(
    t0: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    bgm: boolean,
  ): { g: GainNode } | null {
    const ctx = this.ctx;
    const bus = bgm ? this.bgmBus : this.sfxBus;
    if (!ctx || !bus || !this.noise || !this.canVoice(bgm)) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    this.addVoice(bgm, 1);
    src.onended = () => {
      this.addVoice(bgm, -1);
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    src.start(t0);
    src.stop(t0 + Math.min(dur, C.noiseDur) + C.stopMargin);
    return { g };
  }

  private canVoice(bgm: boolean): boolean {
    return bgm ? this.bgmVoices < C.bgm.maxVoices : canStartSfxVoice(this.voices);
  }

  private addVoice(bgm: boolean, d: number): void {
    if (bgm) this.bgmVoices += d;
    else this.voices += d;
  }

  /** 펄스 PeriodicWave 생성. 실패하면 빈 배열(리드 생략, SFX는 square 폴백). */
  private makeWaves(ctx: AudioContext): PeriodicWave[] {
    try {
      return C.bgm.duties.map((d) => {
        const { real, imag } = pulseWaveCoeffs(d, C.bgm.pulseHarmonics);
        return ctx.createPeriodicWave(real, imag);
      });
    } catch {
      return [];
    }
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
