import { CRT_OFF_DURATION } from '../fxTiming';
// 오디오 튜닝 수치. 모든 게인은 마스터 gain 이전 값(0~1). 칩튠 BGM + 터미널 SFX.
export const AUDIO_CONFIG = {
  masterGain: 0.5,
  /** SFX 동시 보이스 상한. SFX 하나당 보이스 1~3개. */
  maxVoices: 12,
  storageKey: 'bugSquash.audio.muted',
  settingsKey: 'bugSquash.audio.settings',

  /** 기본 설정. BGM은 SFX보다 낮게. */
  defaults: { bgmOn: true, sfxOn: true, bgmVolume: 0.35, sfxVolume: 0.8 },
  settingsRamp: 0.03,
  duckRamp: 0.25,
  /** 게임 오버 중 BGM 배율. */
  duckFactor: 0.25,

  /** BGM: 16분음표 스텝 시퀀서. 곡 데이터는 bgmSong.ts. 리드는 효과음이 묻히지 않게 낮게. */
  bgm: {
    stepsPerBeat: 4,
    lookahead: 0.3,
    tickMs: 80,
    /** lookahead 안에 미리 예약된 보이스도 센다. 곡 피크(bgmPeakVoices) + 여유 4 이상이어야 한다. */
    maxVoices: 20,
    startDelay: 0.08,
    /** 펄스 듀티 (leadDuty 인덱스 순서). */
    duties: [0.125, 0.25] as readonly number[],
    /**
     * 듀티별 음량 보정. 정규화된 PeriodicWave에서 RMS는 sqrt(d(1-d))에 비례:
     * 25% = 0.433, 12.5% = 0.331 (약 -2.3dB, 피크 정규화 후 기본파 차이까지 합쳐 체감 약 -3.5dB).
     * 12.5%를 1.5배(+3.5dB)로 키워 25%와 맞춘다. SFX도 같은 인덱스로 적용.
     */
    dutyGain: [1.5, 1] as readonly number[],
    pulseHarmonics: 48,
    lead: { gain: 0.045, attack: 0.004, sustainRatio: 0.55, gateRatio: 0.92 },
    bass: { type: 'triangle' as OscillatorType, gain: 0.2, steps: 2, gateRatio: 0.9 },
    kick: { gain: 0.3, freq: 150, endFreq: 42, dur: 0.12 },
    snare: { gain: 0.1, dur: 0.1, filterFreq: 1900, q: 0.9 },
    hat: { gain: 0.035, dur: 0.035, filterFreq: 8000 },
  },

  /** 잡기 블립 음계: A 마이너 펜타토닉(반음). 콤보가 오를수록 위 옥타브로 이어진다. */
  scaleSemitones: [0, 3, 5, 7, 10],
  catchBaseFreq: 440, // A4
  /** 콤보 1 = 스텝 0. 이 스텝에서 더 오르지 않는다. */
  catchMaxStep: 9,
  /** 잡기: 키보드 클릭(노이즈 + 고역 틱) + 펄스 블립. */
  catch: {
    blipDuty: 1,
    blipDur: 0.09,
    blipGain: 0.2,
    clickDur: 0.018,
    clickGain: 0.16,
    clickFilterFreq: 2500,
    tickFreq: 4200,
    tickDur: 0.012,
    tickGain: 0.05,
  },
  /** 단단한 버그 1타: 펄스파 주파수가 계단식으로 튀는 글리치. */
  crack: { duty: 0, steps: 5, dur: 0.07, gain: 0.16, minFreq: 250, maxFreq: 2600 },
  /** 골든: 8비트 코인 상승 아르페지오 (펄스 25%). */
  golden: { duty: 1, notes: [0, 4, 7, 12], baseFreq: 659.25, stepDelay: 0.05, lastHold: 0.16, gain: 0.17 },
  /** 기능 탭: 터미널 에러 벨, 낮은 비프 2회. */
  error: { freq: 220, dur: 0.08, gap: 0.04, count: 2, gain: 0.2, type: 'square' as OscillatorType },
  /** 놓침: 짧은 하강 블립 (에러보다 작고 부드럽게). */
  miss: { freq: 420, endFreq: 230, dur: 0.12, gain: 0.13, type: 'triangle' as OscillatorType },
  /** 보드 확장: 펄스 상승 스윕 + 빠른 타자음. */
  expand: {
    duty: 1,
    freq: 220,
    endFreq: 1760,
    dur: 0.3,
    gain: 0.14,
    clicks: 4,
    clickGap: 0.045,
    clickDur: 0.015,
    clickGain: 0.14,
    clickFilterFreq: 2500,
  },
  /** 게임 오버: CRT 전원 꺼짐. 길이는 시각 연출과 공유 상수(fxTiming). reduced이면 AudioManager가 REDUCED_END_FADE_DURATION으로 대체. */
  gameOver: {
    dur: CRT_OFF_DURATION,
    freq: 1500,
    endFreq: 40,
    gain: 0.22,
    type: 'sine' as OscillatorType,
    humFreq: 60,
    humDur: 0.3,
    humGain: 0.14,
  },
  attack: 0.005,
  muteRamp: 0.01,
  stopMargin: 0.02,
  noiseDur: 0.3,
  silentBufferRate: 22050,
} as const;
