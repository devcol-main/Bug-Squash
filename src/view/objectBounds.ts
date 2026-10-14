// 오브젝트 본체 범위 / 그려진 칸 안쪽 반폭 (순수 함수). 렌더러, 스프라이트와 같은 viewConfig 값을 쓴다.
import { VIEW_CONFIG } from './viewConfig';

export type BoundsKind = 'bug' | 'hard' | 'golden' | 'feature';

export interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 버그 도형을 세로로 가운데 맞추기 위해 아래로 내리는 단위 거리. */
export function bugOffsetY(): number {
  return (VIEW_CONFIG.bugTop - VIEW_CONFIG.bugBottom) / 2;
}

/** 칸 전체 박스 한 변을 1로 볼 때, 그려진 칸 외곽선 안쪽 가장자리까지의 반폭. */
export function drawnCellInnerHalf(): number {
  return 0.5 - VIEW_CONFIG.cellInset - VIEW_CONFIG.cellStroke;
}

export function fillOf(kind: BoundsKind): number {
  const c = VIEW_CONFIG;
  return kind === 'hard' ? c.hardFill : kind === 'feature' ? c.featureFill : c.bugFill;
}

/** 칸 중심에서 본체(외곽선 두께 절반 포함, 글로우 제외) 각 방향 끝까지의 거리 / 그려진 칸 안쪽 반폭. */
export function objectBoundsRatio(kind: BoundsKind, out: Bounds): Bounds {
  const c = VIEW_CONFIG;
  const fill = fillOf(kind);
  const half = c.objectStroke / 2;
  const inner = drawnCellInnerHalf();
  let t: number, b: number, s: number;
  if (kind === 'feature') {
    t = b = s = c.gearExtent;
  } else {
    const off = bugOffsetY();
    t = c.bugTop - off;
    b = c.bugBottom + off;
    s = c.bugSide;
  }
  out.top = ((t + half) * fill) / inner;
  out.bottom = ((b + half) * fill) / inner;
  out.left = out.right = ((s + half) * fill) / inner;
  return out;
}
