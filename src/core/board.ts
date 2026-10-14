/** 칸 수 = size * size. 인덱스는 행 우선(row-major). */
export function cellCount(size: number): number {
  return size * size;
}
export function cellRow(index: number, size: number): number {
  return Math.floor(index / size);
}
export function cellCol(index: number, size: number): number {
  return index % size;
}
export function cellIndex(row: number, col: number, size: number): number {
  return row * size + col;
}
export function isValidCell(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount(size);
}
