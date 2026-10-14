// BGM 곡 데이터 (순수 데이터). A 내추럴 마이너, 150 BPM, 8마디 루프, 16분음표 스텝.
// 구조: 질문 4마디(Am-F-C-G, G에서 열린 끝) + 대답 4마디(Am-F-G-Am, A로 해결).
export const STEPS_PER_BAR = 16;
export const SONG_BARS = 8;

/** 리드 음 = [마디 안 시작 스텝, A4 기준 반음 오프셋, 길이(스텝)]. */
export type LeadNote = readonly [number, number, number];

export const BGM_SONG = {
  bpm: 150,
  /** A 내추럴 마이너 음계 (반음, 옥타브 내). */
  scaleSemitones: [0, 2, 3, 5, 7, 8, 10] as readonly number[],
  leadBaseFreq: 440, // A4 (리드 오프셋 0)
  bassBaseFreq: 55, // A1 (베이스 근음 오프셋 0)
  /** 마디별 리드 듀티 인덱스: 0 = 12.5%, 1 = 25%. 질문은 얇게, 대답은 굵게. */
  leadDuty: [0, 0, 0, 0, 1, 1, 1, 1] as readonly number[],
  lead: [
    // 질문: Am
    [[0, 0, 2], [2, 3, 2], [4, 7, 4], [8, 5, 2], [10, 7, 2], [12, 12, 4]],
    // F
    [[0, 12, 3], [3, 8, 1], [4, 12, 2], [6, 15, 2], [8, 12, 4], [12, 8, 4]],
    // C
    [[0, 15, 2], [2, 10, 2], [4, 7, 2], [6, 10, 2], [8, 15, 4], [12, 14, 2], [14, 12, 2]],
    // G (열린 끝)
    [[0, 10, 4], [4, 14, 2], [6, 17, 2], [8, 14, 4], [12, 10, 2], [14, 14, 2]],
    // 대답: Am
    [[0, 12, 2], [2, 15, 2], [4, 19, 4], [8, 15, 2], [10, 12, 2], [12, 7, 4]],
    // F
    [[0, 20, 4], [4, 15, 2], [6, 12, 2], [8, 8, 4], [12, 12, 2], [14, 15, 2]],
    // G
    [[0, 17, 4], [4, 14, 2], [6, 10, 2], [8, 14, 2], [10, 17, 2], [12, 14, 4]],
    // Am (해결)
    [[0, 12, 2], [2, 10, 2], [4, 7, 2], [6, 3, 2], [8, 0, 8]],
  ] as readonly (readonly LeadNote[])[],
  /** 마디별 베이스 근음 (A1 기준 반음). Am, F, C, G, Am, F, G, Am. */
  bassRoots: [0, 8, 3, 10, 0, 8, 10, 0] as readonly number[],
  /** 마디 안 16스텝의 베이스 (근음 기준 반음, null = 쉼). 모든 마디 공통. */
  bassPattern: [0, null, null, 0, null, null, 0, null, 12, null, null, 12, null, null, 7, null] as readonly (number | null)[],
  /** 마디별 드럼 (16글자, x = 타격). 마지막 마디는 필 인. */
  drums: [
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x.x.', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x.....x.x.....x.', snare: '....x.......xxxx', hat: 'x.x.x.x.x.xxxxxx' },
  ] as readonly { kick: string; snare: string; hat: string }[],
};
