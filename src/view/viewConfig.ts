// Bug Squash view 튜닝 수치. (Stack Up viewConfig 구조를 복사해 필요한 것만 남김)
import { DEFAULT_CONFIG } from '../core/config';
export const VIEW_CONFIG = {
  /** devicePixelRatio 상한. */
  maxDpr: 2,

  // --- 레이아웃 (CSS px / 화면 비율) ---
  /** 위쪽 HUD 영역 높이 = 화면 높이 * 비율, [min, max] px로 제한. 로고/문구/점수/콤보/라이프/옵션 버튼이 들어간다고 가정. */
  hudHeightRatio: 0.17,
  hudHeightMin: 104,
  hudHeightMax: 150,
  /**
   * 보드가 HUD 띠와 아래 여백 사이 남는 세로 공간(slack)에서 차지하는 위치. 0 = HUD 쪽, 1 = 아래쪽.
   * HUD 띠는 내용보다 넉넉해서 0.5면 위쪽이 비어 보이므로 약간 위로 올린다. 세로가 아주 긴 화면(높이/폭 비율이
   * tallAspectStart -> tallAspectEnd)에서는 slackBiasTall 까지 선형으로 더 HUD 쪽에 붙인다.
   */
  slackBias: 0.42,
  slackBiasTall: 0.3,
  tallAspectStart: 1.8,
  tallAspectEnd: 2.2,
  /** 아래 여백 = 화면 높이 * 비율. */
  bottomMarginRatio: 0.04,
  /** 좌우 여백 = 화면 폭 * 비율 (한쪽). */
  sideMarginRatio: 0.03,
  /** 그리기용 칸 inset (칸 한 변 비율, 한쪽). 입력 판정은 칸 전체 영역. */
  cellInset: 0.04,
  /** 확장 전 보드 칸 수 (보간 시작 레이아웃). core의 smallBoardSize와 같아야 한다. */
  smallGrid: DEFAULT_CONFIG.smallBoardSize,
  /** 칸 외곽선 두께 (칸 한 변 비율). 각진 사각형(모서리 반경 0). */
  cellStroke: 0.02,

  // --- 색 (레트로 터미널) ---
  bg: '#050A07',
  cellStrokeColor: '#1E5C38',
  cellFillColor: '#0A140E',
  /** 오브젝트가 있는 칸의 외곽선. */
  cellActiveColor: '#39FF88',
  cellGlowBlur: 0.035,
  /** 칸 왼쪽 위 타이틀바 장식 (칸 한 변 비율): 점 개수/크기/간격, 막대 길이/두께, 안쪽 여백. */
  cellTitle: { dots: 3, dot: 0.026, gap: 0.022, barW: 0.26, barH: 0.016, pad: 0.03, brightAlpha: 0.75 },

  colors: {
    bug: '#FFB000',
    hard: '#FF7A1A',
    golden: '#FFF6D0',
    feature: '#3FE0FF',
  },

  // --- 코드 로그 배경 ---
  codeLog: {
    color: '#39FF88',
    alphaMin: 0.06,
    alphaMax: 0.1,
    /** 링 버퍼 최대 줄 수 (고정 크기). 화면에 보이는 줄 수는 이 값으로 제한된다. */
    maxLines: 160,
    /** 줄 높이/막대 높이/글자 단위 폭 (CSS px). */
    lineHeight: 14,
    barHeight: 6,
    /** 글자 단위 폭은 화면 폭에 맞춘다: 가장 긴 줄(maxLineUnits)이 화면 폭의 lineFill 비율에 닿는다. */
    lineFill: 0.8,
    minUnitWidth: 3,
    /** 들여쓰기 한 단계 = indentUnits 글자 단위. 단계 0..maxIndent. */
    indentUnits: 3,
    maxIndent: 4,
    /** 막대 개수 1..maxBars, 막대 길이 minLen..maxLen 글자 단위 (막대 사이 1 단위 간격). */
    maxBars: 5,
    minLen: 2,
    maxLen: 9,
    /** 줄 단위 스텝: 이 간격(초)마다 모두 한 줄 위로. 맨 아래 줄은 간격의 typeFraction 동안 타이핑된다. */
    stepInterval: 0.7,
    typeFraction: 0.8,
    /** 왼쪽 여백 (CSS px). */
    marginX: 10,
  },

  // --- CRT 오버레이 ---
  crt: {
    /** 스캔라인 주기/두께 (CSS px, 그릴 때 디바이스 px로 round(x*dpr) 해서 DPR 1.5 무아레를 막는다)와 알파. */
    scanPeriod: 2,
    scanThickness: 1,
    scanAlpha: 0.08,
    /** 비네팅: 안쪽 반경(화면 대각선 절반 비율)에서 시작해 가장자리 알파까지. */
    vignetteInner: 0.55,
    vignetteAlpha: 0.5,
    /** 밝기 깜박임 진폭(±)과 속도(rad/s). 검은 오버레이 알파 = flickerAmp + 깜박임값. */
    flickerAmp: 0.02,
    flickerSpeedA: 7.3,
    flickerSpeedB: 17.9,
  },

  // --- 픽셀 오브젝트 (칸 한 변 비율) ---
  /** 픽셀 블록 한 변. 모든 종류 공통이라 격자 크기가 곧 실제 크기가 된다. */
  pixelBlock: 0.045,
  objectGlowBlur: 0.05,
  /** 오브젝트 글로우 색 알파. */
  objectGlowAlpha: 0.8,
  /** 오브젝트 스프라이트 표면의 한쪽 글로우 패딩 (칸 한 변 비율). */
  objectPad: 0.1,
  /** 본체가 차지할 수 있는, 그려진 칸 안쪽 반폭 대비 비율 상한. */
  objectMaxRatio: 0.8,
  /** 골든 커서 `_`: 깜박임 주기(초), 켜짐 비율, 폭(블록 수), 버그 아래 빈 줄 수(블록), 색. */
  goldenCursor: { period: 0.8, onRatio: 0.5, cols: 4, gapRows: 1, color: '#FFF6D0' },

  /** 출현/퇴장 팝 시간(초). 퇴장은 노출 끝 이 시간 동안 역재생. */
  popDuration: 0.12,
  /** 보드 확장 재배치 시간(초). 나머지 정지 시간은 4x4 유지. */
  expandAnimDuration: 0.6,
  /** 골든 맥동: 진폭(비율), 속도(rad/s). */
  goldenPulseAmp: 0.06,
  goldenPulseSpeed: 9,

  // --- VFX (시간 초, 길이는 보드 한 변 / 칸 한 변 비율) ---
  fx: {
    /** 풀 크기. 가득 차면 가장 오래 전에 배정한 항목을 덮어쓴다. */
    particlePool: 160,
    popupPool: 16,
    ringPool: 8,
    flashPool: 16,
    ghostPool: 16,
    /** 잡기 squash: 지속(초), 최종 가로/세로 배율. */
    squashDuration: 0.14,
    squashX: 1.45,
    squashY: 0.25,
    /** 기능 탭 톱니 소멸: 지속, 최종 배율, 회전(rad). */
    gearDuration: 0.22,
    gearEndScale: 0.2,
    gearSpin: 1.6,
    /** 칸 외곽선 플래시. */
    flashDuration: 0.22,
    flashLineWidth: 0.05,
    flashFillAlpha: 0.18,
    missFlashDuration: 0.18,
    featureColor: '#FF3B3B',
    /** 입자: 개수, 속도(칸 한 변/초), 수명, 크기(칸 한 변 비율). */
    catchParticles: 9,
    hardCatchParticles: 12,
    goldenParticles: 20,
    particleSpeedMin: 0.9,
    particleSpeedMax: 2.2,
    particleLife: 0.45,
    particleDrag: 3.2,
    particleSize: 0.07,
    /** 골든 반짝임: 초당 개수, 수명, 크기, 퍼짐(칸 비율). */
    sparkleRate: 14,
    sparkleLife: 0.55,
    sparkleSize: 0.05,
    sparkleSpread: 0.42,
    sparkleRise: 0.35,
    /** 링 파동. */
    ringDuration: 0.5,
    ringStart: 0.25,
    ringEnd: 1.3,
    ringLineWidth: 0.06,
    /** 점수 팝업: 지속, 떠오르는 거리(칸 비율), 글자 높이(칸 비율), 글로우(글자 높이 비율). */
    popupDuration: 0.8,
    popupRise: 0.7,
    popupFont: 0.27,
    /** 팝업 텍스트 폭 상한 (칸 폭 비율). */
    popupMaxWidth: 0.9,
    /** 팝업 글자 위쪽 가장자리가 보드 위쪽 가장자리 위로 올라갈 수 있는 한계 (칸 비율). HUD 띠 침범 방지. */
    popupTopOverhang: 0.15,
    /** 팝업 페이드 시작 (진행도). */
    popupFadeStart: 0.55,
    popupGlow: 0.35,
    scoreColor: '#39FF88',
    scoreGlow: '#39FF88',
    goldenTextColor: '#FFF6D0',
    goldenTextGlow: '#FFF6D0',
    /** 확장 배너. */
    bannerText: 'SCALING UP',
    bannerColor: '#39FF88',
    bannerGlow: '#39FF88',
    bannerDuration: 1.3,
    bannerFont: 0.12,
    bannerGlowRatio: 0.3,
    /** 배너 진행도 구간: 페이드 인 끝, 페이드 아웃 길이, 시작 배율, 배율 복귀 끝. */
    bannerFadeIn: 0.12,
    bannerFadeOut: 0.3,
    bannerScaleStart: 0.85,
    bannerScaleEnd: 0.25,
    /** 미리 만들어 둘 텍스트. */
    scoreTexts: ['+10', '+20', '+25', '+30', '+40', '+50', '+75', '+100', '+150', '+200'],
    goldenTexts: ['+1 LIFE', '+50', '+100', '+150', '+200'],
    /** 단단한 버그 1타 흔들림: 지속, 진폭(칸 비율), 진동 속도(rad/s). */
    hitShakeDuration: 0.2,
    hitShakeAmp: 0.07,
    hitShakeFreq: 60,
    /** 화면 흔들림: 지속, 진폭(보드 한 변 비율), 진동 속도. */
    screenShakeFeature: { duration: 0.3, amp: 0.018 },
    screenShakeGameOver: { duration: 0.45, amp: 0.026 },
    screenShakeFreqX: 71,
    screenShakeFreqY: 53,
    /**
     * Reduced motion 정책 값 (motionPolicy.ts가 읽는다).
     * shakeScale 0 = 화면/칸 흔들림 없음. particleScale = 입자 개수와 크기 배율. sparkleScale = 골든 반짝임 빈도 배율.
     * fadeExpand = 보드 확장을 칸 이동 대신 짧은 페이드로 (expandFadeDuration초). bannerScaleAnim false = 배너는 페이드만.
     */
    reduced: { shakeScale: 0, particleScale: 0.5, sparkleScale: 0.25, fadeExpand: true, expandFadeDuration: 0.25, bannerScaleAnim: false, crtFlicker: false },
  },

  /** view 전용 rng 시드 (core rng와 분리, 값은 임의). */
  viewSeed: 20240611,
} as const;
