// 픽셀 오브젝트 그리드 데이터 (순수, DOM 없음). '#' = 채움, '.' = 빔.
// 왼쪽 절반만 쓰고 mirror 로 좌우 대칭을 만든다. odd=true 면 마지막 열이 가운데 열이라 한 번만 쓴다.
export type PixelGrid = readonly string[];

function mirror(half: readonly string[], odd: boolean): PixelGrid {
  return half.map((r) => {
    const rev = r.split('').reverse().join('');
    return r + (odd ? rev.slice(1) : rev);
  });
}

/**
 * 일반 버그 (골든도 같은 모양): 11 x 13, 위에서 본 딱정벌레. 규칙:
 * 1) 세로가 가로보다 크다 (행 >= 열 + 2).
 * 2) 실루엣: 좁은 머리(3) -> 가슴(5~7) -> 허리 줄(5) -> 타원 배(9~11) -> 둥근 꼬리(5).
 * 3) 다리는 양쪽 3개씩. 앞다리는 앞으로, 가운데는 옆으로, 뒷다리는 뒤로 비스듬히 뻗고 몸통에 붙는다.
 * 4) 머리/몸통 가운데에 구멍이나 어두운 블록을 두지 않는다 (눈, 얼굴로 읽히면 안 됨).
 * 5) 맨 아래 줄은 끊기지 않는 한 덩어리.
 */
export const BUG_GRID: PixelGrid = mirror(
  [
    '..#...', '...#..', '....##', '.#.###', '..####', '...###', '#.####',
    '.#####', '######', '.#####', '#.####', '..####', '...###',
  ],
  true,
);

/**
 * 단단한 버그: 12 x 14. 같은 실루엣을 한 단계 키운 것. 등껍질 = 바깥 외곽선 + 1블록 빈 링 + 꽉 찬 안쪽.
 * 짝수 폭이라 가운데 이음선이 2열이다.
 */
export const HARD_GRID: PixelGrid = mirror(
  [
    '.#....', '..#...', '....##', '.#.###', '..####', '...###', '..####',
    '.#....', '#.####', '#.####', '#.####', '.#.###', '.##...', '...###',
  ],
  false,
);

/** 기능: 픽셀 톱니 13 x 13. 둥근 몸통 + 가운데 구멍 + 사방/대각 이빨. 버그와 실루엣이 다르다. */
export const FEATURE_GRID: PixelGrid = mirror(
  [
    '.....##', '.##..##', '.######', '..#####', '..###..', '####...', '####...',
    '####...', '..###..', '..#####', '.######', '.##..##', '.....##',
  ],
  true,
);

/** 금 간 모양: 지정한 [행, 열] 칸을 비운다 (이미 빈 칸은 그대로). */
function carve(grid: PixelGrid, cells: readonly (readonly [number, number])[]): PixelGrid {
  const rows = grid.map((r) => r.split(''));
  for (const [r, c] of cells) if (rows[r] && rows[r]![c] !== undefined) rows[r]![c] = '.';
  return rows.map((r) => r.join(''));
}

/** 단단한 버그 1타 후: 가운데를 가로지르는 지그재그 금 + 껍질 몇 군데가 빠짐. */
export const HARD_CRACKED_GRID: PixelGrid = carve(HARD_GRID, [
  [2, 5], [3, 6], [4, 5], [5, 6], [6, 5], [8, 5], [8, 6], [9, 6], [10, 5], [10, 6], [11, 6], [13, 5],
  [6, 3], [9, 2], [10, 9], [4, 8],
]);

export function gridCols(g: PixelGrid): number {
  return g[0]?.length ?? 0;
}
export function gridRows(g: PixelGrid): number {
  return g.length;
}
export function pixelCount(g: PixelGrid): number {
  let n = 0;
  for (const r of g) for (let i = 0; i < r.length; i++) if (r[i] === '#') n++;
  return n;
}
