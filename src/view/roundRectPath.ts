// roundRect 경로 헬퍼. 구형 Safari(16 미만)/Chrome(99 미만)에는 roundRect가 없어 arcTo로 같은 경로를 만든다 (할당 없음).
// Stack Up fxLayers.ts 의 폴백을 복사해 고쳐 썼다.
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r0: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r0);
    return;
  }
  const r = Math.max(0, Math.min(r0, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
