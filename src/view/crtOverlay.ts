// CRT 오버레이 (스캔라인 + 비네팅). 리사이즈/DPR 변경 때 오프스크린에 한 번 그리고 매 프레임 drawImage 로 덮는다.
// 스캔라인은 디바이스 픽셀 기준(주기 round(2*dpr))이라 DPR 1.5 같은 비정수 배율에서도 무아레가 생기지 않는다.
import { VIEW_CONFIG } from './viewConfig';

/** bakeDark: true면 기본 밝기 감소(flickerAmp)를 오버레이에 미리 굽는다 (깜박임을 끈 모드에서 전체 화면 fillRect 생략용). */
export function buildCrtOverlay(cssW: number, cssH: number, dpr: number, bakeDark: boolean): HTMLCanvasElement {
  const c = VIEW_CONFIG.crt;
  const s = document.createElement('canvas');
  s.width = Math.max(1, Math.round(cssW * dpr));
  s.height = Math.max(1, Math.round(cssH * dpr));
  const g = s.getContext('2d')!;
  if (bakeDark) {
    g.fillStyle = `rgba(0,0,0,${c.flickerAmp})`;
    g.fillRect(0, 0, s.width, s.height);
  }
  // 비네팅: 중심 투명 -> 가장자리 검정
  const r = Math.hypot(s.width, s.height) / 2;
  const grad = g.createRadialGradient(s.width / 2, s.height / 2, r * c.vignetteInner, s.width / 2, s.height / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${c.vignetteAlpha})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s.width, s.height);
  // 가로 스캔라인 (디바이스 px)
  const period = Math.max(2, Math.round(c.scanPeriod * dpr));
  const thick = Math.max(1, Math.round(c.scanThickness * dpr));
  g.fillStyle = `rgba(0,0,0,${c.scanAlpha})`;
  for (let y = 0; y < s.height; y += period) g.fillRect(0, y, s.width, thick);
  return s;
}
