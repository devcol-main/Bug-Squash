/**
 * 키보드 칸 배치. KeyboardEvent.code(물리 키 위치) 기준이라 한글 등 입력기 상태에서도
 * key 값과 무관하게 같은 칸에 대응한다.
 * 4x4 는 전체, 3x3 은 왼쪽 위 3x3 부분만 쓴다.
 */
export const KEY_ROWS: ReadonlyArray<ReadonlyArray<{ readonly code: string; readonly label: string }>> = [
  [{ code: 'Digit1', label: '1' }, { code: 'Digit2', label: '2' }, { code: 'Digit3', label: '3' }, { code: 'Digit4', label: '4' }],
  [{ code: 'KeyQ', label: 'Q' }, { code: 'KeyW', label: 'W' }, { code: 'KeyE', label: 'E' }, { code: 'KeyR', label: 'R' }],
  [{ code: 'KeyA', label: 'A' }, { code: 'KeyS', label: 'S' }, { code: 'KeyD', label: 'D' }, { code: 'KeyF', label: 'F' }],
  [{ code: 'KeyZ', label: 'Z' }, { code: 'KeyX', label: 'X' }, { code: 'KeyC', label: 'C' }, { code: 'KeyV', label: 'V' }],
];

const MAX_GRID = KEY_ROWS.length;

/** gridSize(3 또는 4)별 code -> 칸 / 칸 -> 라벨 표. 모듈 로드 시 한 번만 만든다. */
const codeToCell = new Map<number, Map<string, number>>();
const cellLabels = new Map<number, string[]>();
for (let size = 1; size <= MAX_GRID; size++) {
  const map = new Map<string, number>();
  const labels: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = KEY_ROWS[r]![c]!;
      map.set(k.code, r * size + c);
      labels.push(k.label);
    }
  }
  codeToCell.set(size, map);
  cellLabels.set(size, labels);
}

/** event.code -> 칸 인덱스. 해당 보드에 없는 키는 -1. */
export function keyToCell(code: string, gridSize: number): number {
  return codeToCell.get(gridSize)?.get(code) ?? -1;
}

/** 칸 인덱스 -> 키 라벨('Q', '1'). 범위 밖이면 빈 문자열. */
export function cellToKeyLabel(cell: number, gridSize: number): string {
  return cellLabels.get(gridSize)?.[cell] ?? '';
}
