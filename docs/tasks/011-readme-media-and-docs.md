# Task 011: README 미디어(GIF, 스크린샷)와 기획·개발 글

상태: 확정 (사용자 요청)
작성일: 2026-10-15
저장소: `devcol-main/Bug-Squash`. 브랜치 `task/011-readme-media-and-docs`
규칙: `CLAUDE.md`. 게임 코드의 동작은 바꾸지 않는다.

## 배경
README에 시각 자료가 없다. 사이트(devcol.net)에 올릴 때는 글의 양과 질이 중요하므로, 게임 영상과 스크린샷에 더해 기획 의도, 디자인 결정, 기술 구조, 개발 과정을 담은 글을 영어(README.md)와 한국어(README.ko.md)로 쓴다.

## 1. 미디어 캡처 (`npm run media`)
Arcade-Web의 `scripts/capture-media.mjs` + `scripts/lib/media-lib.mjs`(Stack Up용)를 Bug Squash에 맞게 옮긴다.
- 방식: Vite 개발 서버를 임의 포트로 띄우고, 격리된 임시 프로필의 헤드리스 Chrome을 CDP로 조작, 스크린캐스트 프레임을 ffmpeg로 GIF 인코딩. Chrome은 `/Applications/Google Chrome.app` 또는 `CHROME_PATH`, ffmpeg는 `/opt/homebrew/bin/ffmpeg` 또는 PATH. 새 npm 의존성 없음
- 화면: 세로 모바일 390×844 (DPR 2)
- 결정성: 개발 서버 전용 훅 `window.__bugSquash`(`restart(seed, overrides)`, `logic()`, `tap(cell)`)와 고정 시드 사용. 게임 코드에 캡처 전용 코드를 넣지 않는다 (필요하면 DEV 훅 범위 안에서 최소한으로, 프로덕션 번들에는 없음)
- 봇: 페이지에 주입. `logic()`의 칸 상태를 읽고 사람처럼 반응 지연(약 0.25~0.45초)을 두어 **키보드 이벤트(`KeyboardEvent.code`)로** 칸을 친다 (키 힌트가 화면에 나오도록). 기능은 피하고, 골든·단단한 버그(2타)를 잡는 장면이 나오게 한다
- 리더보드 샘플: 게임 오버 화면에 Top 10이 보이도록 `bugSquash.leaderboard`에 샘플 기록을 미리 넣는다 (현재 저장 형식 `{playerId, nickname, score, stats:{bugsCaught,maxCombo,survivalSec}, ts}`), 공통 닉네임 `devcol.player.nickname`도 넣는다
- 산출물 `docs/media/`:
  - `title.png`: 타이틀 화면 (터미널 창, 키 안내)
  - `gameplay-3x3.png`: 3×3 플레이 (버그·단단한·기능이 함께 보이는 순간, 키 힌트 표시)
  - `gameplay-4x4.png`: 4×4 확장 뒤 플레이 (골든 포함되면 좋음)
  - `gameover.png`: 게임 오버 (GAME OVER, Build failed, 점수, Top 10)
  - `options.png`: 옵션 패널
  - `bug-squash.gif`: 약 15~25초. 타이틀 → 시작 → 잡기(픽셀 분해·팝업) → 콤보 배율 → 보드 확장(`> SCALING UP_` 타이핑) → 4×4 플레이 → 게임 오버(CRT 꺼짐) → 게임 오버 화면. 확장 시점은 DEV 훅 override(`expandAt`)로 앞당겨도 된다. 크기 상한 8MiB (넘으면 해상도·fps를 낮춘 프리셋으로)
- 순수 헬퍼(프레임 목록, ffmpeg 인자, 샘플 리더보드, 키 코드 매핑)는 테스트한다
- 문서: `docs/assets.md`에 미디어가 게임 화면 캡처라는 것과 생성 방법 기록 (외부 에셋 아님)

## 2. 글 (README.md 영어, README.ko.md 한국어, 같은 내용)
메인 세션이 직접 쓴다. 사실은 코드와 명세(`docs/tasks/004~006, 009`)를 근거로 한다.
- 맨 위: 한 줄 소개, GIF, 언어 전환 링크, CI 배지
- 스크린샷 갤러리
- 게임 소개와 조작, 규칙, 점수와 콤보, 난이도 곡선(실제 수치)
- 기획: 왜 두더지잡기를 "버그 잡기"로, 테마(버그와 기능), 첫 버전(네온)에서 레트로 터미널로 바꾼 이유(게임마다 다른 정체성), IP를 피한 디자인(인베이더처럼 보이던 버그를 딱정벌레로), 빈 칸 페널티와 키보드 조작 추가 이유, 접근성(Reduced motion, 색 대신 모양으로 구별)
- 기술: 구조(core/view/audio/ui/input), 결정적 core(시드 rng, dt), 렌더링(오프스크린 스프라이트 캐시, 픽셀 아트 그리드, CRT 오버레이, 풀링, 디바이스 픽셀 스냅), 오디오(코드 합성 칩튠, PeriodicWave 펄스파, lookahead 스케줄러), 입력(Pointer Events 멀티터치, 키보드 물리 위치), 저장(localStorage, 게임별 리더보드, 공통 플레이어 프로필), 번들 크기
- 개발 과정: 명세 → 하위 작업 → 구현/검사/리뷰 에이전트 파이프라인과 반복 한도, 테스트 수, CI
- 로드맵(범위 밖으로 남긴 것: 통합 랭킹 대시보드, 리더보드 서버)
- 라이선스와 크레딧
- 과장 없이 사실만. 수치는 코드 기준으로 확인

## 하위 작업
1. 미디어 캡처 스크립트 + 산출물 (web-implementer)
2. README.md / README.ko.md (메인 세션 직접 작성, web-reviewer가 사실 확인)

## 완료 조건
- [ ] `npm run check` 통과, `npm run build && bash scripts/verify-build.sh` 통과 (프로덕션 번들에 캡처 코드 없음)
- [ ] `npm run media`가 6개 산출물을 만든다 (GIF 8MiB 이하)
- [ ] README 두 개의 이미지 경로가 모두 존재하는 파일을 가리킨다
- [ ] README에 적힌 수치(난이도, 점수, 시간, 테스트 수, 번들 크기)가 코드와 일치
