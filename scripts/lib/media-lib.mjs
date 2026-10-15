// capture-media.mjs 가 쓰는 순수 헬퍼와 페이지 주입용 봇. (Arcade-Web의 Stack Up용 media-lib를 Bug Squash에 맞게 옮김)

/** 키 배치. src/input/keyToCell.ts 의 KEY_ROWS 와 같아야 한다 (tests/media.test.ts 가 비교). */
export const KEY_CODES = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
];

/** gridSize 보드에서 칸 인덱스(행 우선)에 해당하는 KeyboardEvent.code. 범위 밖이면 ''. */
export function cellToCode(cell, gridSize) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= gridSize * gridSize) return '';
  return KEY_CODES[Math.floor(cell / gridSize)]?.[cell % gridSize] ?? '';
}

export const SAMPLE_NICKNAME = 'Debugger';
export const SAMPLE_PLAYER_ID = 'media-sample-player';

/** README 용 샘플 리더보드 (현재 저장 형식 `ScoreEntry<BugSquashStats>[]` JSON). 점수 내림차순 11개. */
export function sampleLeaderboard(baseTs = 1760000000000) {
  const names = ['NullPtr', 'SegFault', 'Heisenbug', 'StackOver', 'RaceCond', 'OffByOne', 'DeadLock', 'MemLeak', 'Hotfix', 'Rebase', 'Intern'];
  return names.map((nickname, i) => ({
    playerId: `sample-${i}`,
    nickname,
    score: 1240 - i * 95,
    stats: { bugsCaught: 96 - i * 7, maxCombo: 31 - i * 2, survivalSec: 118 - i * 8 },
    ts: baseTs + i * 3600000,
  }));
}

/** 페이지 시작 전에 심는 localStorage 값 [키, 문자열]. */
export function storageSeed() {
  const board = sampleLeaderboard();
  return [
    ['bugSquash.leaderboard', JSON.stringify(board)],
    ['bugSquash.best', String(board[0].score)],
    ['devcol.player.nickname', SAMPLE_NICKNAME],
    ['devcol.player.id', SAMPLE_PLAYER_ID],
  ];
}

/** 캡처용 core 설정 덮어쓰기. 짧은 영상 안에 단단한 버그/골든/확장이 나오도록 앞당긴다. */
export const GIF_OVERRIDES = { expandAt: 10, hardFrom: 3, hardRatio: 0.35, goldenFrom: 5, goldenChance: 0.12 };
/** 게임 오버 연출 시작 시각(플레이 시간 초). 확장(expandAt) + 확장 연출(1.5초) + 4x4 플레이 약 5초. */
export const GIF_DIE_AT = 16.5;
/** 스틸 판: 4x4 촬영 뒤 이 시간(플레이 시간 초)이 지나면 일부러 실수해 게임 오버로 간다. */
export const STILL_DIE_AFTER_SEC = 18;
/** 스틸용: 3x3 장면. 오브젝트가 한꺼번에 여러 개 보이도록 출현을 촘촘하게. */
export const STILL_3X3_OVERRIDES = {
  expandAt: 600, hardFrom: 0, hardRatio: 0.4, goldenFrom: 0, goldenChance: 0.08,
  featureRatioStart: 0.3, featureRatioMax: 0.3, maxConcurrentSmall: 3, spawnIntervalStart: 0.6, spawnIntervalMin: 0.6,
};
/** 스틸용: 4x4 장면. 15초에 확장(그 전 점수가 쌓인다)하고 이후 골든이 잘 나오게. */
export const STILL_4X4_OVERRIDES = {
  expandAt: 15, hardFrom: 0, hardRatio: 0.4, goldenFrom: 0, goldenChance: 0.1,
  featureRatioStart: 0.25, featureRatioMax: 0.25, maxConcurrentLarge: 5, spawnIntervalStart: 0.6, spawnIntervalMin: 0.6,
};

/** 봇 반응 지연 범위(초). GIF는 사람처럼, 스틸은 오브젝트가 겹쳐 보이도록 조금 느리게. */
export const GIF_DELAY = [0.25, 0.45];
export const STILL_DELAY = [0.6, 1.1];

/**
 * 스틸 촬영 조건. 완화 단계(레벨)가 낮을수록 엄격하다. 기다린 시간이 길어질수록 다음 레벨로 완화한다.
 * kinds: 반드시 포함해야 하는 종류, min: 오브젝트 최소 개수.
 */
export const SHOT_LEVELS = {
  '3x3': [
    { kinds: ['hard', 'feature'], min: 3 },
    { kinds: ['feature'], min: 3 },
    { kinds: [], min: 2 },
  ],
  '4x4': [
    { kinds: ['golden'], min: 2, goldenReady: true },
    { kinds: [], min: 3 },
    { kinds: [], min: 2 },
  ],
};
export const SHOT_RELAX_SEC = 12;

export function shotLevelFor(which, waitedSec) {
  const levels = SHOT_LEVELS[which];
  return levels[Math.min(levels.length - 1, Math.max(0, Math.floor(waitedSec / SHOT_RELAX_SEC)))];
}

/**
 * probeScene()이 돌려준 장면이 촬영 조건을 만족하는가.
 * scene: { size, expanding, over, kinds: string[] (빈 칸 제외), taps }.
 * taps(이 판에서 봇이 누른 키 수)가 1 이상이어야 키 힌트가 이미 떠 있다.
 */
export function sceneMatches(scene, which, level) {
  if (scene.over || scene.expanding || scene.taps < 1) return false;
  if (scene.size !== (which === '3x3' ? 3 : 4)) return false;
  if (scene.kinds.length < level.min) return false;
  if (level.goldenReady && !scene.goldenReady) return false;
  return level.kinds.every((k) => scene.kinds.includes(k));
}

/** 페이지 안에서 현재 장면을 읽는다 (Function.toString으로 주입 — 외부 변수 참조 금지). */
export function probeScene() {
  const s = window.__bugSquash.logic();
  const kinds = [];
  let goldenReady = false; // 골든이 나타난 연출이 끝났고 아직 사라지기 전이라 온전히 보이는 상태
  for (let i = 0; i < s.cellCount; i++) {
    const o = s.getCell(i);
    if (o.kind === null) continue;
    kinds.push(o.kind);
    if (o.kind === 'golden' && o.duration - o.remaining >= 0.25 && o.remaining >= 0.3) goldenReady = true;
  }
  const bot = window.__bot;
  return { size: s.boardSize, expanding: s.isExpanding, over: s.isGameOver, kinds, goldenReady, taps: bot ? bot.taps : 0, time: s.time, lives: s.lives, score: s.score };
}

/**
 * 스크린캐스트 프레임 → ffmpeg concat demuxer 목록.
 * frames: [{ file, t }] (t = 초, 오름차순). endT: 마지막 프레임이 끝나는 시각(초).
 * 같은 t가 겹치면 최소 간격으로 보정해 duration 0을 피한다.
 */
export function buildConcatList(frames, endT) {
  if (frames.length === 0) return '';
  const quote = (f) => `file '${f.replace(/'/g, "'\\''")}'`;
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : endT;
    const dur = Math.max(next - frames[i].t, 0.001);
    lines.push(quote(frames[i].file), `duration ${dur.toFixed(4)}`);
  }
  // concat demuxer는 마지막 파일을 한 번 더 적어야 마지막 duration이 적용된다.
  if (frames.length > 0) lines.push(quote(frames[frames.length - 1].file));
  return lines.join('\n') + '\n';
}

/** GIF 인코딩 후보 (큰 것부터). MAX_GIF_BYTES(5MiB)를 넘으면 다음 후보로 내려간다. */
export const GIF_PRESETS = [
  { width: 320, fps: 12, colors: 96 },
  { width: 300, fps: 12, colors: 80 },
  { width: 280, fps: 10, colors: 64 },
  { width: 260, fps: 10, colors: 48 },
];

export function ffmpegGifArgs(listFile, out, p) {
  const vf = `fps=${p.fps},scale=${p.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${p.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  return ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', vf, '-loop', '0', out];
}

/**
 * 페이지 안에서 실행되는 봇 (Function.toString으로 주입 — 외부 변수 참조 금지, 아래 keyRows는 opts로 받는다).
 * 매 rAF마다 window.__bugSquash.logic()의 칸을 읽고, 새로 나타난 버그를 사람 같은 지연(opts.delay 초, 시드 rng) 뒤에
 * 키보드 이벤트(KeyboardEvent.code)로 친다. 단단한 버그는 짧은 간격으로 두 번. 기능은 건드리지 않는다.
 * dieAt(플레이 시간 초, 페이지에서 window.__bot.dieAt으로 바꿀 수 있다) 이후에는 버그를 무시하고, 기능이나 빈 칸을 일부러 쳐서 라이프를 소진한다.
 * opts: { seed, delay: [min, max], dieAt: number | null, skipGolden, keyRows }. 페이지에서 window.__bot.dieAt / delay / skipGolden을 바꿀 수 있다.
 */
export function installBot(opts) {
  let a = opts.seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const delayMs = () => (st.delay[0] + rnd() * (st.delay[1] - st.delay[0])) * 1000;
  const st = { dieAt: opts.dieAt, delay: opts.delay, skipGolden: !!opts.skipGolden, taps: 0, error: null, recs: [], size: 0, nextMistake: 0, mistakes: 0 };
  window.__bot = st;
  const press = (cell, size) => {
    const code = opts.keyRows[Math.floor(cell / size)]?.[cell % size];
    if (!code) return;
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
    st.taps++;
  };
  const step = (nowMs) => {
    if (window.__bot !== st) return; // 새 봇이 설치되면 이전 봇은 멈춘다
    const s = window.__bugSquash.logic();
    if (s.isGameOver) return; // 게임 오버면 봇 종료 (새 판이면 installBot을 다시 부른다)
    requestAnimationFrame(tick);
    const size = s.boardSize;
    if (size !== st.size) {
      st.size = size;
      st.recs = [];
      for (let i = 0; i < 16; i++) st.recs.push({ active: false, due: 0, skip: false });
    }
    if (s.isExpanding) return;
    const dying = st.dieAt !== null && s.time >= st.dieAt;
    const n = size * size;
    let feature = -1;
    let empty = -1;
    for (let i = 0; i < n; i++) {
      const o = s.getCell(i);
      const r = st.recs[i];
      if (o.kind === null) {
        r.active = false;
        if (empty < 0 || rnd() < 0.4) empty = i;
        continue;
      }
      if (o.kind === 'feature') feature = i;
      if (!r.active) {
        r.active = true;
        r.due = nowMs + delayMs();
      }
      r.skip = o.kind === 'feature' || dying || (o.kind === 'golden' && st.skipGolden); // 매 프레임 갱신
      if (!r.skip && nowMs >= r.due) {
        press(i, size);
        r.due = nowMs + 130 + rnd() * 70; // 단단한 버그의 두 번째 타. 한 번에 사라지는 버그는 다음 프레임에 비어 있게 된다
      }
    }
    if (dying && nowMs >= st.nextMistake) {
      // 일부러 하는 실수: 기능이 있으면 그것을, 없으면 빈 칸을 친다
      const target = feature >= 0 && st.mistakes % 2 === 0 ? feature : empty;
      if (target >= 0) {
        press(target, size);
        st.mistakes++;
        st.nextMistake = nowMs + 650 + rnd() * 250;
      }
    }
  };
  const tick = (nowMs) => {
    try {
      step(nowMs);
    } catch (e) {
      st.error = String(e); // 조용히 멈추지 않고 스크립트가 알 수 있게
    }
  };
  requestAnimationFrame(tick);
}
