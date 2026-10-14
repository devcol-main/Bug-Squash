// VFX 그리기. 상태(FxState)를 읽어 Canvas 에 그린다. shadowBlur 없음 (텍스트는 TextCache 스프라이트).
import { easeOutCubic } from './anim';
import { typedChars } from './fxCurves';
import { FlashStyle, FxState, FX_COLORS, PopupStyle } from './fxState';
import { TextCache, TextStyle } from './fxText';
import type { BoardRect } from './layout';
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;

/** 오브젝트 아래(칸 위)에 그리는 것: 칸 플래시 (외곽선형, 반전형). */
export function drawFlashes(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect): void {
  const items = fx.flashes.items;
  for (let i = 0; i < items.length; i++) {
    const f = items[i]!;
    if (!f.active) continue;
    const k = f.t / f.dur;
    const cell = f.frac * b.size;
    const side = cell * (1 - 2 * VIEW_CONFIG.cellInset);
    const x = b.x + f.u * b.size - side / 2;
    const y = b.y + f.v * b.size - side / 2;
    const a = 1 - k;
    ctx.fillStyle = FX_COLORS[f.color]!;
    if (f.style === FlashStyle.Invert) {
      // 칸 전체를 색으로 채웠다가 빠르게 사라진다.
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, side, side);
      continue;
    }
    ctx.strokeStyle = FX_COLORS[f.color]!;
    ctx.lineWidth = Math.max(1, FX.flashLineWidth * cell);
    ctx.globalAlpha = a * FX.flashFillAlpha;
    ctx.fillRect(x, y, side, side);
    ctx.globalAlpha = a;
    ctx.strokeRect(x, y, side, side);
  }
  ctx.globalAlpha = 1;
}

/** 픽셀 분해 조각 + 골든 반짝임. 각진 사각형을 그대로 그린다 (합성 모드 변경 없음). */
export function drawParticles(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect): void {
  const ps = fx.particles.items;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (!p.active) continue;
    const s = Math.max(1, p.size * b.size);
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = FX_COLORS[p.color]!;
    ctx.fillRect(b.x + p.u * b.size - s / 2, b.y + p.v * b.size - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 점수 팝업 + `> SCALING UP_` 타이핑 배너. */
export function drawTexts(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect, text: TextCache): void {
  const ps = fx.popups.items;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (!p.active) continue;
    const k = p.t / FX.popupDuration;
    const spr = text.get(p.style === PopupStyle.Golden ? TextStyle.Golden : TextStyle.Score, p.text);
    const cell = p.frac * b.size;
    // 스프라이트는 3x3 칸 기준 글자 크기. 텍스트 폭이 칸 폭 상한을 넘지 않게 제한.
    const scale = Math.min(p.frac * 3, (FX.popupMaxWidth * cell) / spr.textW);
    const w = spr.w * scale;
    const h = spr.h * scale;
    // 글자 위쪽 가장자리(글로우 제외)가 board.y - overhang 아래에 오도록 중심 y를 제한한다.
    const cy = Math.max(b.y - FX.popupTopOverhang * cell + (spr.textH * scale) / 2, b.y + p.v * b.size - FX.popupRise * cell * easeOutCubic(k));
    ctx.globalAlpha = k < FX.popupFadeStart ? 1 : 1 - (k - FX.popupFadeStart) / (1 - FX.popupFadeStart);
    ctx.drawImage(spr.canvas, b.x + p.u * b.size - w / 2, cy - h / 2, w, h);
  }
  if (fx.bannerT >= 0) drawBanner(ctx, fx, b, text);
  ctx.globalAlpha = 1;
}

function drawBanner(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect, text: TextCache): void {
  const total = FX.bannerText.length;
  const t = fx.bannerT;
  const typing = fx.policy.typing;
  const n = typedChars(t, total, FX.bannerTypeDuration, typing);
  const done = n >= total;
  // 타이핑 중에는 커서 고정, 끝나면 깜박임 (reduced 는 커서 고정).
  const cursor = !done || !typing || Math.floor((t - FX.bannerTypeDuration) / FX.bannerCursorPeriod) % 2 === 0;
  const spr = text.banner(n, cursor);
  const full = text.banner(total, true);
  const k = t / FX.bannerDuration;
  ctx.globalAlpha = Math.min(1, (1 - k) / FX.bannerFadeOut);
  // 전체 문자열 기준 왼쪽에 고정해서 글자가 늘어나도 앞 글자가 움직이지 않게 한다.
  const pad = (spr.w - spr.textW) / 2;
  ctx.drawImage(spr.canvas, b.x + b.size / 2 - full.textW / 2 - pad, b.y + b.size / 2 - spr.h / 2, spr.w, spr.h);
}
