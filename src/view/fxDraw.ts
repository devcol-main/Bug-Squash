// VFX 그리기. 상태(FxState)를 읽어 Canvas 에 그린다. shadowBlur 없음 (텍스트는 TextCache 스프라이트).
import { easeOutCubic } from './anim';
import { FxState, FX_COLORS, GhostMode, PopupStyle, ghostDuration } from './fxState';
import { bannerScale } from './motionPolicy';
import { TextCache, TextStyle } from './fxText';
import type { BoardRect } from './layout';
import type { Sprites } from './sprites';
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;

/** 오브젝트 아래(칸 위)에 그리는 것: 칸 플래시. */
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
    ctx.strokeStyle = FX_COLORS[f.color]!;
    ctx.lineWidth = Math.max(1, FX.flashLineWidth * cell);
    ctx.globalAlpha = a * FX.flashFillAlpha;
    ctx.fillRect(x, y, side, side);
    ctx.globalAlpha = a;
    ctx.strokeRect(x, y, side, side);
  }
  ctx.globalAlpha = 1;
}

/** 잡힌/탭된 오브젝트가 사라지는 연출. */
export function drawGhosts(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect, sp: Sprites): void {
  const items = fx.ghosts.items;
  for (let i = 0; i < items.length; i++) {
    const g = items[i]!;
    if (!g.active) continue;
    const k = Math.min(1, g.t / ghostDuration(g.mode));
    const img = sp.get(Math.round(1 / g.frac)).objects[g.sprite];
    if (!img) continue;
    const d = g.frac * b.size * (1 + 2 * VIEW_CONFIG.objectPad);
    const cx = b.x + g.u * b.size;
    const cy = b.y + g.v * b.size;
    if (g.mode === GhostMode.Squash) {
      const sx = 1 + (FX.squashX - 1) * k;
      const sy = 1 + (FX.squashY - 1) * k;
      ctx.globalAlpha = 1 - k * k;
      ctx.drawImage(img, cx - (d * sx) / 2, cy - (d * sy) / 2, d * sx, d * sy);
    } else {
      const s = 1 + (FX.gearEndScale - 1) * easeOutCubic(k);
      ctx.globalAlpha = 1 - k;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(FX.gearSpin * k);
      ctx.drawImage(img, -(d * s) / 2, -(d * s) / 2, d * s, d * s);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** 입자 + 링 (가산 합성으로 빛나는 느낌). */
export function drawParticlesAndRings(ctx: CanvasRenderingContext2D, fx: FxState, b: BoardRect): void {
  ctx.globalCompositeOperation = 'lighter';
  const ps = fx.particles.items;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (!p.active) continue;
    const s = Math.max(1, p.size * b.size);
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = FX_COLORS[p.color]!;
    ctx.fillRect(b.x + p.u * b.size - s / 2, b.y + p.v * b.size - s / 2, s, s);
  }
  const rs = fx.rings.items;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!;
    if (!r.active) continue;
    const k = r.t / FX.ringDuration;
    const cell = r.frac * b.size;
    const radius = (cell / 2) * (FX.ringStart + (FX.ringEnd - FX.ringStart) * easeOutCubic(k));
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = FX_COLORS[r.color]!;
    ctx.lineWidth = Math.max(1, FX.ringLineWidth * cell * (1 - k));
    ctx.beginPath();
    ctx.arc(b.x + r.u * b.size, b.y + r.v * b.size, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** 점수 팝업 + SCALING UP 배너. */
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
  if (fx.bannerT >= 0) {
    const k = fx.bannerT / FX.bannerDuration;
    const spr = text.get(TextStyle.Banner, FX.bannerText);
    const fadeIn = Math.min(1, k / FX.bannerFadeIn);
    const fadeOut = Math.min(1, (1 - k) / FX.bannerFadeOut);
    const s = bannerScale(fx.policy, FX.bannerScaleStart + (1 - FX.bannerScaleStart) * easeOutCubic(k / FX.bannerScaleEnd));
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    const w = spr.w * s;
    const h = spr.h * s;
    ctx.drawImage(spr.canvas, b.x + b.size / 2 - w / 2, b.y + b.size / 2 - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}
