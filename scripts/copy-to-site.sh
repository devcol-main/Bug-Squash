#!/usr/bin/env bash
# dist → ../devcol-site/devcol-build/docs/public/games/bug-squash
# 사용법: npm run build && bash scripts/copy-to-site.sh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo_root/dist"
dest="$repo_root/../devcol-site/devcol-build/docs/public/games/bug-squash"

if [ ! -d "$src" ]; then
  echo "Missing $src. Run 'npm run build' first." >&2
  exit 1
fi

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$src/." "$dest/"
echo "Copied $src -> $dest"
