// 최고 기록 / 마지막 닉네임 저장. 스토리지는 주입하고, 접근 실패는 모두 삼킨다.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // 저장 불가: 메모리 값만 유지
  }
}

export class BestScore {
  private best: number;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly key: string,
  ) {
    const n = Number(read(storage, key));
    this.best = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  get value(): number {
    return this.best;
  }

  /** 점수를 반영한다. 신기록이면 true. 저장에 실패해도 메모리 값은 갱신된다. */
  submit(score: number): boolean {
    if (!Number.isFinite(score) || score <= this.best) return false;
    this.best = Math.floor(score);
    write(this.storage, this.key, String(this.best));
    return true;
  }

  /** 최고 기록을 0으로 되돌린다(저장값도 0). */
  reset(): void {
    this.best = 0;
    write(this.storage, this.key, '0');
  }
}

export class NicknameStore {
  private nick: string;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly key: string,
    private readonly maxLength: number,
  ) {
    this.nick = (read(storage, key) ?? '').slice(0, maxLength);
  }

  get value(): string {
    return this.nick;
  }

  save(nick: string): void {
    this.nick = nick.slice(0, this.maxLength);
    write(this.storage, this.key, this.nick);
  }

  /** 저장된 닉네임을 지운다. */
  clear(): void {
    this.nick = '';
    write(this.storage, this.key, '');
  }
}
