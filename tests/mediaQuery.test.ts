import { describe, expect, it } from 'vitest';
import { onMediaChange, type MediaQueryListLike } from '../src/ui/mediaQuery';
import { watchDpr } from '../src/ui/dprWatcher';

describe('onMediaChange', () => {
  it('only addEventListener available -> subscribes and unsubscribes with it', () => {
    const hs = new Set<() => void>();
    const mql: MediaQueryListLike = {
      matches: false,
      addEventListener: (_t, cb) => hs.add(cb),
      removeEventListener: (_t, cb) => hs.delete(cb),
    };
    let n = 0;
    const off = onMediaChange(mql, () => n++);
    hs.forEach((h) => h());
    expect(n).toBe(1);
    off();
    expect(hs.size).toBe(0);
  });

  it('only addListener available -> falls back to addListener/removeListener', () => {
    const hs = new Set<() => void>();
    const mql: MediaQueryListLike = {
      matches: false,
      addListener: (cb) => hs.add(cb),
      removeListener: (cb) => hs.delete(cb),
    };
    let n = 0;
    const off = onMediaChange(mql, () => n++);
    hs.forEach((h) => h());
    expect(n).toBe(1);
    off();
    expect(hs.size).toBe(0);
  });

  it('neither available -> does nothing and does not throw', () => {
    const off = onMediaChange({ matches: false }, () => {});
    expect(() => off()).not.toThrow();
  });
});

describe('watchDpr with legacy MediaQueryList', () => {
  it('addListener-only query -> re-registers with one listener left, and dispose leaves none', () => {
    const queries: { handlers: Set<() => void> }[] = [];
    let n = 0;
    const off = watchDpr(
      () => {
        const entry = { handlers: new Set<() => void>() };
        queries.push(entry);
        return { matches: true, addListener: (cb) => entry.handlers.add(cb), removeListener: (cb) => entry.handlers.delete(cb) };
      },
      () => 1,
      () => n++,
    );
    expect(queries[0]!.handlers.size).toBe(1);
    [...queries[0]!.handlers].forEach((h) => h()); // 복사본 순회: 핸들러가 재등록하며 Set을 바꾼다
    expect(n).toBe(1);
    expect(queries[0]!.handlers.size).toBe(0); // 이전 리스너는 removeListener로 제거됨
    expect(queries[1]!.handlers.size).toBe(1);
    off();
    expect(queries[1]!.handlers.size).toBe(0);
  });

  it('query lacking both APIs -> returns without throwing', () => {
    expect(() => watchDpr(() => ({ matches: true }), () => 1, () => {})()).not.toThrow();
  });
});
