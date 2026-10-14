// 코드 로그 배경의 상태 (순수 로직, DOM 없음). 줄 데이터는 고정 크기 typed array 링 버퍼. update 중 할당 없음.
// 터미널 출력처럼 stepInterval 마다 모든 줄이 한 줄 위로 올라가고(줄 단위 스텝), 맨 아래 줄은 막대가 늘어나며 타이핑된다.
import { VIEW_CONFIG } from './viewConfig';

const C = VIEW_CONFIG.codeLog;

export class CodeLog {
  readonly capacity = C.maxLines;
  /** 줄당 막대 개수(1..maxBars), 들여쓰기 단계, 알파(0..1), 전체 길이(글자 단위, 간격 포함). */
  readonly barCount = new Uint8Array(this.capacity);
  readonly indent = new Uint8Array(this.capacity);
  readonly alpha = new Float32Array(this.capacity);
  readonly total = new Uint16Array(this.capacity);
  /** 줄당 maxBars 개 막대 길이. */
  readonly barLen = new Uint8Array(this.capacity * C.maxBars);
  /** 가장 최근(맨 아래) 줄의 링 인덱스. */
  head = 0;
  private timer = 0;
  /** 지금까지 push 된 줄 수 (테스트/진단용). */
  pushed = 0;

  constructor(private readonly rand: () => number) {
    for (let i = 0; i < this.capacity; i++) this.fill(i);
    this.pushed = 0;
  }

  private fill(slot: number): void {
    const r = this.rand;
    this.indent[slot] = Math.min(C.maxIndent, Math.floor(r() * (C.maxIndent + 1)));
    const n = 1 + Math.min(C.maxBars - 1, Math.floor(r() * C.maxBars));
    this.barCount[slot] = n;
    let total = this.indent[slot]! * C.indentUnits;
    for (let b = 0; b < n; b++) {
      const len = C.minLen + Math.min(C.maxLen - C.minLen, Math.floor(r() * (C.maxLen - C.minLen + 1)));
      this.barLen[slot * C.maxBars + b] = len;
      total += len + (b < n - 1 ? 1 : 0);
    }
    this.total[slot] = total;
    this.alpha[slot] = C.alphaMin + r() * (C.alphaMax - C.alphaMin);
  }

  /** dt초 진행. dt <= 0 이면 아무 것도 바뀌지 않는다. */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.timer += dt;
    while (this.timer >= C.stepInterval) {
      this.timer -= C.stepInterval;
      this.head = (this.head + 1) % this.capacity;
      this.fill(this.head);
      this.pushed++;
    }
  }

  /** 맨 아래 줄의 타이핑 진행도 0..1. */
  typedFraction(): number {
    return Math.min(1, this.timer / (C.stepInterval * C.typeFraction));
  }

  /** 아래에서 k번째 줄(0 = 맨 아래)의 링 인덱스. */
  slotAt(k: number): number {
    return (this.head - k + this.capacity * 2) % this.capacity;
  }
}

/** 한 줄이 가질 수 있는 최대 길이 (글자 단위): 최대 들여쓰기 + 막대 최대 개수 * 최대 길이 + 간격. */
export const MAX_LINE_UNITS = C.maxIndent * C.indentUnits + C.maxBars * C.maxLen + (C.maxBars - 1);

/** 화면 폭에 맞춘 글자 단위 폭 (CSS px): 가장 긴 줄이 화면 폭의 lineFill 비율에 닿는다. */
export function codeLogUnitWidth(cssW: number): number {
  return Math.max(C.minUnitWidth, (cssW * C.lineFill) / MAX_LINE_UNITS);
}

/** 화면 높이를 덮는 데 필요한 줄 수 (링 버퍼 용량으로 제한). */
export function codeLogRows(cssH: number): number {
  return Math.min(C.maxLines, Math.ceil(cssH / C.lineHeight) + 1);
}
