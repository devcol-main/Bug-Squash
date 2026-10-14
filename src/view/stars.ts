// 패럴랙스 별 필드 (Stack Up stars.ts 복사, 카메라 제거). 고정 크기 배열만 쓰고 프레임 중 할당하지 않는다.
import { VIEW_CONFIG } from './viewConfig';

/** 0..1 범위로 래핑 (음수 포함). */
export function wrap01(v: number): number {
  return v - Math.floor(v);
}

export class StarField {
  readonly layerCount = VIEW_CONFIG.stars.length;
  readonly starts: Int32Array;
  readonly u: Float32Array;
  readonly v: Float32Array;
  readonly scroll: Float64Array;

  constructor(rand: () => number) {
    this.starts = new Int32Array(this.layerCount + 1);
    let total = 0;
    for (let l = 0; l < this.layerCount; l++) {
      this.starts[l] = total;
      total += VIEW_CONFIG.stars[l]!.count;
    }
    this.starts[this.layerCount] = total;
    this.u = new Float32Array(total);
    this.v = new Float32Array(total);
    this.scroll = new Float64Array(this.layerCount);
    for (let i = 0; i < total; i++) {
      this.u[i] = rand();
      this.v[i] = rand();
    }
  }

  update(dt: number): void {
    for (let l = 0; l < this.layerCount; l++) {
      this.scroll[l] = wrap01(this.scroll[l]! + dt * VIEW_CONFIG.stars[l]!.drift);
    }
  }

  screenY(i: number, l: number, cssH: number): number {
    return wrap01(this.v[i]! + this.scroll[l]!) * cssH;
  }
}
