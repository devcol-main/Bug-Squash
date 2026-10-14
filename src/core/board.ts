/** 칸 수 = size * size. 인덱스는 행 우선(row-major). */
export function cellCount(size: number): number {
  return size * size;
}
export function isValidCell(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount(size);
}
