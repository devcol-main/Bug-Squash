/** 고정 크기 링 버퍼. 이벤트 핸들러가 push, 게임 루프가 drain. 할당 없음. */
export class InputQueue {
  private readonly buf: Int32Array;
  private head = 0;
  private count = 0;
  private _enabled = true;

  constructor(capacity: number) {
    this.buf = new Int32Array(Math.max(1, capacity));
  }

  get enabled(): boolean { return this._enabled; }
  get length(): number { return this.count; }

  /** 비활성화하면 큐를 비우고 이후 push 를 무시한다. */
  setEnabled(v: boolean): void {
    this._enabled = v;
    if (!v) this.clear();
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /** 성공하면 true. 비활성, 음수 칸, 용량 초과면 false (새 입력을 버림). */
  push(cell: number): boolean {
    if (!this._enabled || !Number.isInteger(cell) || cell < 0 || this.count >= this.buf.length) return false;
    this.buf[(this.head + this.count) % this.buf.length] = cell;
    this.count++;
    return true;
  }

  /** 들어온 순서대로 모두 꺼낸다. */
  drain(cb: (cell: number) => void): void {
    while (this.count > 0) {
      const cell = this.buf[this.head] as number;
      this.head = (this.head + 1) % this.buf.length;
      this.count--;
      cb(cell);
    }
  }
}
