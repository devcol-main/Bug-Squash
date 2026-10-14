/** 입력 쪽 튜닝 수치. */
export const INPUT_CONFIG = {
  /** 프레임 사이에 쌓아둘 수 있는 탭 최대 개수 (넘치면 새 입력을 버림). */
  queueCapacity: 16,
  /** 진동 패턴(ms). 숫자 배열은 [진동, 쉼, 진동, ...]. */
  vibration: {
    featureTap: 30,
    miss: 40,
    gameOver: [40, 50, 40] as readonly number[],
  },
} as const;
