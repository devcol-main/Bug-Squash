#!/usr/bin/env bash
# 빌드 결과 검증: dist/ 크기 한도와 개발 전용 훅 문자열 유무를 확인한다.
# 사용법: npm run build && bash scripts/verify-build.sh   (CI와 로컬에서 동일)
set -euo pipefail

# --- 설정 (한 곳) ---
MAX_KB=300                  # dist 크기 한도 (KB)
DEV_HOOKS=("__bugSquash")   # 프로덕션 번들에 있으면 안 되는 개발 전용 훅
DIST_DIR="${DIST_DIR:-dist}"

cd "$(dirname "$0")/.."

if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
  echo "ERROR: no build found in $DIST_DIR/ (run npm run build first)" >&2
  exit 1
fi

fail=0
kb="$(du -sk "$DIST_DIR" | cut -f1)"
echo "== $DIST_DIR: $(du -sh "$DIST_DIR" | cut -f1) (${kb}KB, limit ${MAX_KB}KB)"
if [ "$kb" -gt "$MAX_KB" ]; then
  echo "ERROR: $DIST_DIR is ${kb}KB, over the ${MAX_KB}KB limit" >&2
  fail=1
fi
for hook in "${DEV_HOOKS[@]}"; do
  hits="$(grep -rIl -F -- "$hook" "$DIST_DIR" || true)"
  if [ -n "$hits" ]; then
    echo "ERROR: build contains dev-only hook '$hook' in:" >&2
    echo "$hits" | sed 's/^/  /' >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "Build verification FAILED" >&2
  exit 1
fi
echo "Build verification passed"
