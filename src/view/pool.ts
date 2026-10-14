// 고정 크기 객체 풀. 생성 시 한 번만 할당하고 이후 새 객체를 만들지 않는다.
export interface Poolable {
  active: boolean;
}

export class Pool<T extends Poolable> {
  readonly items: T[] = [];
  private cursor = 0;

  constructor(readonly capacity: number, factory: () => T) {
    for (let i = 0; i < capacity; i++) this.items.push(factory());
  }

  /**
   * 비활성 항목을 꺼내 active = true 로 만든다. 가득 찼으면 "가장 오래 전에 배정된" 항목을
   * (라운드 로빈) 덮어쓴다. 새 연출이 누락되는 것보다 오래된 연출이 끊기는 편이 덜 거슬린다.
   */
  acquire(): T {
    const n = this.capacity;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const it = this.items[i] as T;
      if (!it.active) {
        this.cursor = (i + 1) % n;
        it.active = true;
        return it;
      }
    }
    const it = this.items[this.cursor] as T;
    this.cursor = (this.cursor + 1) % n;
    it.active = true;
    return it;
  }

  get activeCount(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) if ((this.items[i] as T).active) c++;
    return c;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) (this.items[i] as T).active = false;
  }
}
