# Bug Squash

[![CI](https://github.com/devcol-main/Bug-Squash/actions/workflows/ci.yml/badge.svg)](https://github.com/devcol-main/Bug-Squash/actions/workflows/ci.yml)

A tap-the-bug browser game with a terminal look, built with TypeScript, Canvas 2D and WebAudio. Bugs pop up on a grid of cells; squash them before they escape, avoid the feature cells, and survive as the board scales up. No game engine, no external CDN, and no audio files: every sound is synthesized in code.

## Controls

- Tap / click a cell to squash.
- Keyboard: `1234 / QWER / ASDF / ZXCV` map to the 4x4 grid (the 3x3 grid uses `123 / QWE / ASD`).
- `Space` starts and restarts, `M` mutes.

## Rules

- Tapping an empty cell costs 1 life.
- Tapping a feature costs 1 life.
- Missing a normal or hard bug also costs 1 life; missing a golden bug has no penalty.
- At 45 seconds the board grows to 4x4.

## Development

Requires Node.js 24 (see [`.nvmrc`](.nvmrc)).

```bash
npm ci
npm run dev      # dev server
npm run check    # tsc --noEmit + Vitest
npm run build    # production build to dist/ (relative paths)
```

Check the bundle after a build with `bash scripts/verify-build.sh` (size limit 300KB, no dev-only hooks in the bundle).

## Embedding in the site

```bash
npm run build
bash scripts/copy-to-site.sh
```

This copies `dist/` to `../devcol-site/devcol-build/docs/public/games/bug-squash/`, which the VitePress page embeds in an iframe.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pull requests and pushes to `main`: `npm ci`, `npm run check`, `npm run build`, then `scripts/verify-build.sh`.

## License

- Code: [Apache License 2.0](LICENSE). See [`NOTICE`](NOTICE).
- Font: JetBrains Mono, SIL Open Font License 1.1, bundled with its license in `public/licenses/`.
- DevCol logo (`src/assets/`): owned by DevCol; not licensed for reuse under Apache-2.0 (see [`docs/assets.md`](docs/assets.md)).

Originally developed in [devcol-main/Arcade-Web](https://github.com/devcol-main/Arcade-Web).
