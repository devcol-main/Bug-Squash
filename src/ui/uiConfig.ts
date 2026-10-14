import { DEFAULT_CONFIG } from '../core/config';

// Bug Squash UI 튜닝 수치와 localStorage 키. (Stack Up uiConfig를 복사해 수정)
export const UI_CONFIG = {
  /** 게임 오버 직후 이 시간(초) 동안 입력(재시작)을 무시한다. core config의 값을 그대로 쓴다. */
  gameOverInputLockSec: DEFAULT_CONFIG.gameOverInputLock,
  /** 프레임 dt 상한(초). core의 이벤트 버퍼(256) 용량 전제와 맞춘다. */
  maxFrameDt: 0.1,
  /** 리더보드에 표시하는 항목 수. */
  leaderboardSize: 10,
  /** 폰트 로드를 기다리는 최대 시간(ms). 넘기면 폴백 폰트로 그냥 시작한다. */
  fontTimeoutMs: 1500,
  /** document.fonts.load에 넘기는 폰트 스펙. */
  fontSpec: '800 16px Geist',
  bestKey: 'bugSquash.best',
  /** 공통 프로필로 옮기기 전의 옛 닉네임 키. 가져오기만 하고 쓰지 않는다. */
  legacyNicknameKey: 'bugSquash.nickname',
  reducedMotionKey: 'bugSquash.reducedMotion',
  vibrationKey: 'bugSquash.vibration',
  leaderboardKey: 'bugSquash.leaderboard',
  /** 데이터 초기화 확인 대기 시간(ms). 지나면 첫 단계로 돌아간다. */
  resetConfirmMs: 3000,
} as const;
