# Assets

라이선스가 확인된 에셋만 사용한다. 외부 CDN 의존 금지(폰트, 사운드 모두 저장소에 포함).

| 에셋 | 파일 | 출처 URL | 라이선스 | 사용처 | 추가일 |
|---|---|---|---|---|---|
| JetBrains Mono (variable, latin subset, wght 100–800) | src/assets/fonts/jetbrains-mono-latin-wght-normal.woff2 (라이선스: public/licenses/JetBrainsMono-OFL-LICENSE.txt, 빌드 시 dist/licenses/로 함께 배포) | https://github.com/JetBrains/JetBrainsMono (npm: @fontsource-variable/jetbrains-mono 5.3.0, 로컬 devcol-site node_modules에서 복사). 이전에 쓰던 Geist는 Task 005에서 Bug Squash에서 제거됨 (Stack Up은 계속 사용) | SIL OFL 1.1 | Bug Squash 화면 텍스트 | 2026-10-14 |
| DevCol logo, dark-background variant | src/assets/devcol-logo-dark.png | Arcade-Web `scripts/make-dark-logo.mjs`로 `devcol-site/devcol-build/docs/public/logo.png`에서 파생 (Stack Up의 devcol-logo-dark.png와 동일). 원본은 DevCol 소유 | DevCol 소유 — 이 저장소의 Apache-2.0 코드 라이선스와 별개로 상표/로고 사용 권리는 DevCol에 있음 | Bug Squash 좌상단 로고(모든 화면). 파비콘은 원본 사용 | 2026-10-14 |
| DevCol logo (256x256 PNG, 투명 배경) | src/assets/devcol-logo.png | Stack Up과 동일 (Stack Up의 devcol-logo.png 복사, Arcade-Web 저장소). 원본은 DevCol 소유 | DevCol 소유 — 이 저장소의 Apache-2.0 코드 라이선스와 별개로 상표/로고 사용 권리는 DevCol에 있음 | Bug Squash 파비콘 | 2026-10-15 |
