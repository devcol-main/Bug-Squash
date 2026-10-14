// MediaQueryList 변경 감지 헬퍼. Safari 13 이하는 addEventListener/removeEventListener 대신 addListener/removeListener만 있다.
export interface MediaQueryListLike {
  matches: boolean;
  addEventListener?: (type: 'change', cb: () => void) => void;
  removeEventListener?: (type: 'change', cb: () => void) => void;
  addListener?: (cb: () => void) => void;
  removeListener?: (cb: () => void) => void;
}

/** change 리스너를 등록하고 해제 함수를 돌려준다. 둘 다 지원하지 않으면 아무 것도 하지 않는다. */
export function onMediaChange(mql: MediaQueryListLike, cb: () => void): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', cb);
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', cb);
    };
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(cb);
    return () => {
      if (typeof mql.removeListener === 'function') mql.removeListener(cb);
    };
  }
  return () => {};
}
