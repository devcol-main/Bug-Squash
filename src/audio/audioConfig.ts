// 오디오 튜닝 수치. 모든 게인은 마스터 gain 이전 값(0~1). Stack Up 구조를 복사해 Bug Squash용으로 바꿨다.
export const AUDIO_CONFIG = {
  masterGain: 0.5,
  /** SFX 동시 보이스 상한. 골든 아르페지오(5음 + 반짝임 = 6) + 잡기(2) + 놓침/버저 여유. */
  maxVoices: 14,
  storageKey: 'bugSquash.audio.muted',
  settingsKey: 'bugSquash.audio.settings',

  /** 기본 설정. BGM은 SFX보다 낮게. */
  defaults: { bgmOn: true, sfxOn: true, bgmVolume: 0.35, sfxVolume: 0.8 },
  settingsRamp: 0.03,
  duckRamp: 0.25,
  /** 게임 오버 중 BGM 배율. */
  duckFactor: 0.25,

  /** BGM: 8분음표 스텝 시퀀서. D 마이너 펜타토닉, Stack Up(108)보다 빠른 템포. */
  bgm: {
    bpm: 144,
    stepsPerBar: 8,
    stepsPerBeat: 2,
    bassSteps: [0, 3, 4, 7], // 마디 안 베이스 스텝 (싱코페이션)
    bars: 4,
    baseFreq: 146.83, // D3 (아르페지오 기준음)
    scaleSemitones: [0, 3, 5, 7, 10], // D F G A C
    /** 한 마디(8스텝)의 아르페지오: 음계 인덱스(옥타브 이어붙임), null=쉼. */
    arpPattern: [0, 3, 2, null, 4, 3, 5, 2] as readonly (number | null)[],
    barShift: [0, 1, 0, -1],
    /** 마디별 베이스 근음(D 기준 반음). D, G, F, A. */
    bassRoots: [0, 5, 3, 7],
    bassBaseFreq: 36.71, // D1
    hatSteps: [1, 3, 4, 5, 7],
    lookahead: 0.3,
    tickMs: 80,
    maxVoices: 8,
    startDelay: 0.08,
    arp: { type: 'square' as OscillatorType, gain: 0.06, dur: 0.14, filterFreq: 2600 },
    bass: { type: 'sawtooth' as OscillatorType, gain: 0.15, dur: 0.18, filterFreq: 420 },
    hat: { gain: 0.04, dur: 0.04, filterFreq: 7500 },
  },

  /** 잡기 음계: 장조 5음 음계(반음 오프셋). 콤보가 오를수록 위 옥타브로 이어진다. */
  scaleSemitones: [0, 2, 4, 7, 9],
  catchBaseFreq: 523.25, // C5
  /** 콤보 1 = 스텝 0. 이 스텝에서 더 오르지 않는다. */
  catchMaxStep: 9,

  catchTone: { dur: 0.16, gain: 0.28, harmonicGain: 0.1, type: 'triangle' as OscillatorType },
  /** 단단한 버그 1타: 노이즈 버스트 + 높은 클릭. */
  crack: {
    noiseDur: 0.07,
    noiseGain: 0.22,
    noiseFilterFreq: 3500,
    clickFreq: 2800,
    clickEndFreq: 1800,
    clickDur: 0.03,
    clickGain: 0.12,
    clickType: 'square' as OscillatorType,
  },
  /** 골든: 상승 아르페지오 + 위 옥타브 반짝임. */
  golden: {
    notes: [0, 4, 7, 12, 16],
    baseFreq: 783.99, // G5
    stepDelay: 0.055,
    dur: 0.2,
    gain: 0.16,
    type: 'sine' as OscillatorType,
    sparkleGain: 0.06,
  },
  /** 기능 탭: 낮은 사각파 부저 두 번. */
  error: { freq: 140, endFreq: 120, dur: 0.09, gap: 0.12, count: 2, gain: 0.2, type: 'square' as OscillatorType, filterFreq: 900 },
  /** 놓침: 짧고 부드러운 하강음 (에러보다 작고 짧게). */
  miss: { freq: 330, endFreq: 190, dur: 0.14, gain: 0.14, type: 'sine' as OscillatorType },
  /** 보드 확장: 상승 스윕. */
  expand: { freq: 180, endFreq: 900, dur: 0.4, gain: 0.18, type: 'sawtooth' as OscillatorType, filterFreq: 1600 },
  /** 게임 오버: 하강 시퀀스 (반음 오프셋). */
  gameOver: {
    notes: [0, -3, -7, -12],
    baseFreq: 440,
    stepDelay: 0.16,
    /** 음 끝의 주파수 비율 (살짝 처지는 느낌). */
    endRatio: 0.97,
    dur: 0.32,
    gain: 0.22,
    type: 'triangle' as OscillatorType,
    filterFreq: 1400,
  },
  attack: 0.005,
  muteRamp: 0.01,
  stopMargin: 0.02,
  noiseDur: 0.3,
  silentBufferRate: 22050,
  harmonicType: 'sine' as OscillatorType,
  harmonicDurRatio: 0.8,
} as const;
