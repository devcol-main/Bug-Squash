// Bug Squash 튜닝 수치. 모든 난이도/규칙 값은 여기에만 둔다.
export interface BugSquashConfig {
  startLives: number;
  maxLives: number;

  /** 플레이 시간(초)이 이 값에 도달하면 3x3 -> 4x4 로 한 번 확장. */
  expandAt: number;
  /** 확장 연출 동안 출현 정지(초). */
  expandPause: number;
  smallBoardSize: number;
  largeBoardSize: number;

  /** 첫 출현까지의 대기(초). */
  firstSpawnDelay: number;
  spawnIntervalStart: number;
  /** 초당 곱해지는 비율 (start * decay^t). */
  spawnIntervalDecay: number;
  spawnIntervalMin: number;

  exposureStart: number;
  /** 초당 감소량. */
  exposureDecayPerSec: number;
  exposureMin: number;

  /** 동시 최대 오브젝트: [기본값, 승격 시각(초), 승격 후 값]. */
  maxConcurrentSmall: number;
  maxConcurrentSmallLate: number;
  maxConcurrentSmallLateAt: number;
  maxConcurrentLarge: number;
  maxConcurrentLargeLate: number;
  maxConcurrentLargeLateAt: number;

  featureRatioStart: number;
  /** 초당 증가량(비율 단위, 0.003 = 0.3%p). */
  featureRatioPerSec: number;
  featureRatioMax: number;

  hardFrom: number;
  /** 버그 중 단단한 버그 비율. */
  hardRatio: number;
  hardExposureMul: number;
  hardHp: number;

  goldenFrom: number;
  /** 오브젝트 생성당 골든 확률. */
  goldenChance: number;
  goldenExposureMul: number;

  cellCooldown: number;
  /** 게임 오버 직후 재시작 입력 무시(초). UI 쪽에서 사용. core는 쓰지 않는다. */
  gameOverInputLock: number;

  scoreBug: number;
  scoreHard: number;
  scoreGolden: number;
  /** 콤보가 이 값에 도달하면 배율이 1씩 오른다. */
  comboTiers: readonly number[];

  /** update(dt) 내부 하위 스텝 상한(초). 큰 dt에서도 출현/만료/확장을 정확히 처리. */
  maxStep: number;
}

export const DEFAULT_CONFIG: BugSquashConfig = {
  startLives: 3,
  maxLives: 3,

  expandAt: 45,
  expandPause: 1.5,
  smallBoardSize: 3,
  largeBoardSize: 4,

  firstSpawnDelay: 0.5,
  spawnIntervalStart: 1.0,
  spawnIntervalDecay: 0.985,
  spawnIntervalMin: 0.35,

  exposureStart: 1.4,
  exposureDecayPerSec: 0.012,
  exposureMin: 0.6,

  maxConcurrentSmall: 2,
  maxConcurrentSmallLate: 3,
  maxConcurrentSmallLateAt: 30,
  maxConcurrentLarge: 4,
  maxConcurrentLargeLate: 5,
  maxConcurrentLargeLateAt: 90,

  featureRatioStart: 0.1,
  featureRatioPerSec: 0.003,
  featureRatioMax: 0.3,

  hardFrom: 20,
  hardRatio: 0.15,
  hardExposureMul: 1.3,
  hardHp: 2,

  goldenFrom: 15,
  goldenChance: 0.02,
  goldenExposureMul: 0.7,

  cellCooldown: 0.2,
  gameOverInputLock: 0.6,

  scoreBug: 10,
  scoreHard: 25,
  scoreGolden: 50,
  comboTiers: [5, 10, 20],

  maxStep: 0.05,
};
