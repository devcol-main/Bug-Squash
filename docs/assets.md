# Assets

라이선스가 확인된 에셋만 사용한다. 외부 CDN 의존 금지(폰트, 사운드 모두 저장소에 포함).

| 에셋 | 파일 | 출처 URL | 라이선스 | 사용처 | 추가일 |
|---|---|---|---|---|---|
| JetBrains Mono (variable, latin subset, wght 100–800) | src/assets/fonts/jetbrains-mono-latin-wght-normal.woff2 (라이선스: public/licenses/JetBrainsMono-OFL-LICENSE.txt, 빌드 시 dist/licenses/로 함께 배포) | https://github.com/JetBrains/JetBrainsMono (npm: @fontsource-variable/jetbrains-mono 5.3.0, 로컬 devcol-site node_modules에서 복사). 이전에 쓰던 Geist는 Task 005에서 Bug Squash에서 제거됨 (Stack Up은 계속 사용) | SIL OFL 1.1 | Bug Squash 화면 텍스트 | 2026-10-14 |
| DevCol logo, dark-background variant | src/assets/devcol-logo-dark.png | Arcade-Web `scripts/make-dark-logo.mjs`로 `devcol-site/devcol-build/docs/public/logo.png`에서 파생 (Stack Up의 devcol-logo-dark.png와 동일). 원본은 DevCol 소유 | DevCol 소유 — 이 저장소의 Apache-2.0 코드 라이선스와 별개로 상표/로고 사용 권리는 DevCol에 있음 | Bug Squash 좌상단 로고(모든 화면). 파비콘은 원본 사용 | 2026-10-14 |
| DevCol logo (256x256 PNG, 투명 배경) | src/assets/devcol-logo.png | Stack Up과 동일 (Stack Up의 devcol-logo.png 복사, Arcade-Web 저장소). 원본은 DevCol 소유 | DevCol 소유 — 이 저장소의 Apache-2.0 코드 라이선스와 별개로 상표/로고 사용 권리는 DevCol에 있음 | Bug Squash 파비콘 | 2026-10-15 |

## docs/media (게임 화면 캡처)

외부 에셋이 아니다. `docs/media/`의 PNG와 GIF는 이 게임을 직접 실행해서 캡처한 화면이다 (README용).
`npm run media`로 다시 만든다. 개발 서버 + 헤드리스 Chrome(CDP) + ffmpeg를 쓰며, 시드는 `MEDIA_SEED`(기본 7).
스크립트는 `scripts/capture-media.mjs`, 헬퍼는 `scripts/lib/media-lib.mjs`. 샘플 리더보드와 닉네임은 가상의 값이다.

캡처는 고정 시드와 실제보다 앞당긴 설정을 쓴다. GIF: 보드 확장 10초, 단단한/골든 버그를 더 일찍·자주. 스크린샷: 보드 확장 15초, 출현 간격 0.6초 고정, 단단한/골든/기능 비율 상향(게임 오버 화면의 점수와 NEW BEST도 이 설정에서 나온 것). 리더보드 이름은 샘플 데이터. 보이는 연출은 실제 게임과 같다.
