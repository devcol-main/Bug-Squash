// 디바이스 픽셀 격자 스냅 계산 (순수 함수). 렌더러가 레이어 위치, 스캔라인 알파, 골든 버그 크기/위치에 쓴다.

export interface LayerSpan { y0: number; y1: number; heightPx: number }

/** CSS px y 를 디바이스 픽셀 격자 아래쪽으로 스냅. */
export function snapDown(v: number, dpr: number): number {
  return Math.floor(v * dpr + 1e-6) / dpr;
}

/**
 * 오프스크린 레이어의 세로 범위. 시작 y 는 격자로 내림, 높이는 정수 디바이스 px 로 올림한다.
 * 합성할 때 소스 높이(heightPx)와 목적지 높이(heightPx/dpr)가 정확히 대응하고 시작 y 가 격자 위에 있게 된다.
 */
export function layerSpan(rawY0: number, rawY1: number, cssH: number, dpr: number): LayerSpan {
  const y0 = snapDown(Math.max(0, rawY0), dpr);
  const end = Math.min(cssH, rawY1);
  const heightPx = Math.max(1, Math.ceil((end - y0) * dpr - 1e-6));
  return { y0, y1: y0 + heightPx / dpr, heightPx };
}

export interface ScanlineParams { period: number; thick: number; alpha: number }

/**
 * 스캔라인: 디바이스 px 주기/두께와, "덮인 비율 x 알파"가 DPR 1(기준)일 때와 같아지도록 보정한 알파.
 * basePeriod/baseThick 는 CSS px 기준 설정값(DPR 1 에서 그대로 쓰인다).
 */
export function scanlineParams(dpr: number, basePeriod: number, baseThick: number, baseAlpha: number): ScanlineParams {
  const period = Math.max(2, Math.round(basePeriod * dpr));
  const thick = Math.max(1, Math.round(baseThick * dpr));
  const alpha = baseAlpha * (baseThick / basePeriod) / (thick / period);
  return { period, thick, alpha };
}

export interface SnappedSquare { left: number; top: number; size: number }

export function newSnappedSquare(): SnappedSquare { return { left: 0, top: 0, size: 0 }; }

/**
 * 정사각형을 중심(cx, cy; CSS px)과 크기(CSS px) 기준으로 짝수 정수 디바이스 px 크기, 디바이스 px 격자 위치로 맞춘다. 결과는 CSS px.
 * 매 프레임 호출되므로 out 에 채워 돌려준다 (할당 없음).
 */
export function snapSquareEven(cx: number, cy: number, size: number, dpr: number, out: SnappedSquare): SnappedSquare {
  const px = Math.max(2, 2 * Math.round((size * dpr) / 2));
  const half = px / 2;
  out.left = (Math.round(cx * dpr) - half) / dpr;
  out.top = (Math.round(cy * dpr) - half) / dpr;
  out.size = px / dpr;
  return out;
}
