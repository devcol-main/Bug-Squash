# Task 009: Bug Squash 마무리 정리 (이월 항목)

상태: 확정 (사용자 요청: 이월 항목 진행)
작성일: 2026-10-15
플랫폼: 웹 (TypeScript + Canvas 2D). 저장소 `devcol-arcade-web`, 규칙은 `CLAUDE.md`
선행: Task 004~006, 007, 008이 main에 머지됨. main에서 브랜치 `task/009-bug-squash-polish`
범위: `games/bug-squash`만. `games/stack-up/`, `shared/`는 수정하지 않는다. 게임 규칙·점수·난이도 수치는 바꾸지 않는다.

## 배경
Task 004~006 리뷰에서 "막을 사유는 아니지만 고칠 것"으로 `docs/pipeline-log.md`에 이월된 항목을 정리한다. Task 004의 비주얼/오디오 이월 항목은 Task 005에서 전면 교체되어 대부분 무효이므로, 지금 코드에 **아직 남아 있는 것만** 다룬다. 각 항목은 구현 전에 현재 코드에 문제가 실제로 남아 있는지 먼저 확인하고, 이미 해결됐으면 건너뛰고 보고한다.

## 1. 동작 수정
- **A. 제출 후 Space:** 게임 오버 화면에서 닉네임 제출 후 Submit 버튼에 포커스가 남으면 Space가 재시작 대신 Submit을 다시 누른다. 제출이 끝나면 Submit 버튼(과 입력칸) 포커스를 해제해 Space가 재시작으로 동작하게 한다
- **B. Reduced motion 게임 오버 소리:** reduced motion일 때 시각 연출은 0.25초 페이드인데 게임 오버 소리는 0.4초다. 오디오가 reduced 상태를 알 수 있게 연결하고, reduced일 때 게임 오버 소리 길이를 페이드 길이(`fxTiming`의 상수)에 맞춘다
- **C. 파형 생성 실패 시 음량:** PeriodicWave 생성이 실패해 `'square'`로 대체될 때도 `dutyGain`(듀티 보정)이 곱해져 소리가 커진다. 실제로 PeriodicWave를 썼을 때만 보정한다
- **D. Reduced motion에서 쓰지 않는 CRT 오버레이 생성:** reduced일 때 쓰지 않는 깜박임용 오버레이를 리사이즈마다 만들지 않는다 (지연 생성 등)
- **E. 구형 Safari(13 이하):** `MediaQueryList.addEventListener`가 없으면 `addListener`로 대체한다 (reduced motion 감지, DPR 감지 모두). 없을 때 게임 루프가 시작조차 못 하는 일이 없어야 한다

## 2. 렌더링 선명도와 배치
- **F. DPR 1.5 글리치/CRT 꺼짐 레이어 반 픽셀 어긋남:** 레이어 시작 y를 디바이스 픽셀 격자에 맞춘다 (`Math.floor(y*dpr)/dpr` 등)
- **G. DPR 1.5 스캔라인 농도:** 스캔라인 두께/주기 비율이 DPR마다 달라 1.5에서 화면이 더 어둡다. 비율에 따라 알파를 보정해 DPR 1/1.5/2에서 평균 밝기가 같게 한다
- **H. 골든 버그 맥동 흐림:** 골든은 항상 맥동해서 스냅되지 않아 약간 흐리다. 맥동 중에도 그리기 위치를 디바이스 픽셀에 스냅하고, 크기 변화는 정수 디바이스 픽셀 단위로 반올림한다
- **I. 왼쪽 safe-area:** 로고(`.brand`)와 `.hud-best`도 오른쪽(`--safe-r`)처럼 열 바깥 여백을 뺀 값(`--safe-l`)을 쓴다
- **J. 라이프 조각이 Sound 버튼을 덮음:** 깨질 때 위로 튀는 조각이 Sound 버튼 아래쪽을 잠깐 덮는다. 조각이 위로는 덜 튀게(아래·옆 위주) 하거나 버튼 아래에 그려지게 한다
- **K. 파비콘:** 지금 파비콘이 어두운 배경용 로고(흰색)라서 밝은 탭에서 안 보인다. Stack Up처럼 원본 로고(`devcol-logo.png`)를 복사해 파비콘으로 쓰고 `docs/assets.md`에 기록한다

## 3. 코드 정리와 테스트
- **L. CSS 값 TS 복제 동기화:** `layout.ts`의 `hudContentBottom`, `hud.ts`의 `muteLogoGapU`가 CSS 값을 손으로 복제한다. 테두리 2px 누락을 반영하고, CSS 쪽 해당 규칙에 "바꾸면 TS도 수정" 주석이 모두 있는지 확인한다. 쓰이지 않는 `safeRightU` 인자는 테스트를 추가하거나 제거한다
- **M. 키 힌트 수치 config화:** `keyHints.ts`의 `+1`, 줄 높이 `1.2`, 글자 중심 `0.5` 등을 `viewConfig.keyHint`로 옮긴다. 힌트 간격 테스트는 `sprites.ts`와 같은 반올림을 쓰는 공유 함수로 막대 끝을 계산한다
- **N. 글리치 경계 지터 조건:** `screenGlitchEdgeJitter`는 0.5 미만이어야 띠 경계가 단조 증가한다. config 주석과 테스트로 고정한다
- **O. 키보드 phase 타입:** `KeyboardInput`의 `phase: string`을 좁힌다. input → ui 의존이 생기지 않게 input 쪽에 `'playing' | …` 리터럴 타입을 두거나 boolean `playing`으로 받는다
- **P. 쓰지 않는 코드:** `Spawner.schedule()` 등 쓰이지 않는 함수가 남아 있으면 제거한다 (core는 이 항목에 한해 수정 허용, 동작 변화 없음)
- **Q. 과장된 테스트 이름:** `pauseAndMotion.test.ts`(약 66, 176행)와 hard 그리드 테스트 등 이름이 검증 내용보다 넓은 테스트를 고치거나 단언을 보강한다
- **R. 게임 오버 오버레이 지연 타이머:** `main.ts` 안에 있는 지연 타이머 로직을 DOM 없는 작은 헬퍼(`ui/`)로 빼서 테스트한다 (지연 만료, 일시정지 중 정지, 새 게임 시 취소)

## 하위 작업 순서
1. 동작 수정 A~E + 테스트
2. 렌더링 선명도와 배치 F~K + 테스트
3. 코드 정리 L~R

## 완료 조건
### 자동 검증
- [ ] `npm run check` 통과 (Stack Up 포함), CI 통과
- [ ] A: 제출 후 Space가 재시작으로 동작 (포커스 해제 로직 테스트)
- [ ] B: reduced일 때 게임 오버 소리 길이 = 페이드 길이, 기본일 때 = CRT 꺼짐 길이
- [ ] C: 'square' 대체 시 듀티 보정 1
- [ ] E: `addEventListener` 없는 MediaQueryList에서도 오류 없이 동작
- [ ] F/G/H: 스냅·알파 보정 순수 함수 테스트 (DPR 1, 1.5, 2)
- [ ] K: 파비콘 파일과 assets.md 항목
- [ ] L~R: 각 항목의 테스트 또는 검증
- [ ] 빌드 용량 300KB 이하, 프로덕션 번들에 개발 훅 없음

### 수동 확인 (사람)
- [ ] DPR 1.5 화면(일부 Windows 노트북)에서 글리치·CRT 꺼짐·스캔라인
- [ ] 골든 버그가 선명한지
- [ ] 밝은 브라우저 탭에서 파비콘이 보이는지
- [ ] 노치 기기 가로 화면에서 로고·BEST 위치

## 범위 밖
- 단단한 버그 가운데·뒷다리 디자인 변경 (사람이 눈으로 보고 결정)
- 난이도 수치 조정, 사이트 임베드, 통합 랭킹, 리더보드 서버
- Stack Up 이월 항목
