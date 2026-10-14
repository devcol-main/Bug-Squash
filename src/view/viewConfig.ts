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
  /** 아래 여백 = 화면 높이 * 비율. */
  bottomMarginRatio: 0.04,
  /** 좌우 여백 = 화면 폭 * 비율 (한쪽). */
  sideMarginRatio: 0.03,
  /** 그리기용 칸 inset (칸 한 변 비율, 한쪽). 입력 판정은 칸 전체 영역. */
  cellInset: 0.06,
  /** 확장 전 보드 칸 수 (보간 시작 레이아웃). core의 smallBoardSize와 같아야 한다. */
  smallGrid: DEFAULT_CONFIG.smallBoardSize,
  cellCorner: 0.16,
  cellStroke: 0.025,

  // --- 색 ---
  bgTop: '#07020F',
  bgBottom: '#1D0634',
  gridColor: '#FF3CC8',
  gridAlpha: 0.25,
  gridFlickerDepth: 0.4,
  gridFlickerSpeed: 1.6,
  /** 2 이상이어야 한다 (k / (n - 1)). */
  gridHorizontalLines: 8,
  gridCurve: 1.8,
  /** 그리드 지평선 y = 보드 위 + 보드 높이 * 이 값 (보드 뒤쪽 하단). */
  gridHorizonRatio: 0.6,
  /** 소실점 쪽/바닥 쪽 세로선 간격 (보드 한 변 비율). */
  gridSpacingTop: 0.06,
  gridSpacingBottom: 0.26,

  cellColor: '#33DDFF',
  cellStrokeAlpha: 0.35,
  cellFillAlpha: 0.06,
  cellBrightStrokeAlpha: 0.95,
  cellGlowBlur: 0.035,

  colors: {
    bug: '#FF33CC',
    hard: '#A64DFF',
    golden: '#FFD166',
    feature: '#33FFAA',
  },
  /** 외곽선을 글로우 색보다 얼마나 밝게(흰색 혼합 비율) 할지. */
  strokeLighten: 0.4,

  // --- 오브젝트 (칸 한 변 비율) ---
  /** 도형 단위 공간(중심 원점)에서 버그의 위(더듬이 끝)/아래(몸통)/좌우(다리) 범위. 그릴 때 세로 중심을 맞추도록 (top-bottom)/2 만큼 내려 그린다. */
  bugTop: 0.84,
  bugBottom: 0.57,
  bugSide: 0.64,
  /** 톱니바퀴 반경. */
  gearExtent: 0.5,
  bugFill: 0.42,
  hardFill: 0.445,
  featureFill: 0.6,
  objectGlowBlur: 0.05,
  /** 오브젝트 스프라이트 표면의 한쪽 글로우 패딩 (칸 한 변 비율). */
  objectPad: 0.1,
  /** 본체(외곽선 포함)가 차지할 수 있는, 그려진 칸 안쪽 반폭 대비 비율 상한. */
  objectMaxRatio: 0.8,
  objectStroke: 0.07, // 오브젝트 단위 길이 대비
  objectFillAlpha: 0.22,

  /** 출현/퇴장 팝 시간(초). 퇴장은 노출 끝 이 시간 동안 역재생. */
  popDuration: 0.12,
  /** 보드 확장 재배치 시간(초). 나머지 정지 시간은 4x4 유지. */
  expandAnimDuration: 0.6,
  /** 골든 맥동: 진폭(비율), 속도(rad/s). */
  goldenPulseAmp: 0.06,
  goldenPulseSpeed: 9,


  // --- 별 (뒤에서 앞 순서). drift: 화면 높이/초 ---
  stars: [
    { count: 36, drift: 0.006, size: 1, alpha: 0.35, color: '#B58CFF' },
    { count: 24, drift: 0.012, size: 1.5, alpha: 0.5, color: '#8FE8FF' },
    { count: 12, drift: 0.022, size: 2, alpha: 0.7, color: '#FFFFFF' },
  ],
  starSeed: 20240611,
} as const;
