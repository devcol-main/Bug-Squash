// view와 audio가 함께 쓰는 연출 길이(초). 소리와 화면이 어긋나지 않게 한 곳에서만 정의한다.
/** 게임 오버 CRT 꺼짐 길이. 게임 오버 소리 길이도 이 값이다. */
export const CRT_OFF_DURATION = 0.4;
/** reduced motion일 때 게임 오버 페이드 길이. (소리는 AudioManager.setReducedMotion으로 이 값을 쓴다.) */
export const REDUCED_END_FADE_DURATION = 0.25;
