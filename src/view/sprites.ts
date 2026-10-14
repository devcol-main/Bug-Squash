// 칸/오브젝트 스프라이트 캐시. 리사이즈/DPR 변경 시에만 오프스크린에 그린다 (shadowBlur는 build 안에서만).
// 모든 스프라이트는 "칸 전체 영역" 정사각형(refSize CSS px)을 덮는다. 그릴 때 칸 크기로 스케일한다.
import { roundRectPath } from './roundRectPath';
import { bugOffsetY } from './objectBounds';
import { VIEW_CONFIG } from './viewConfig';

export const SpriteId = {
  Bug: 0,
  Hard: 1,
  HardCracked: 2,
  Golden: 3,
  Feature: 4,
} as const;

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex: string, k: number): string {
  const [r, g, b] = parse(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}

type Ctx = CanvasRenderingContext2D;
type CreateSurface = (w: number, h: number) => HTMLCanvasElement;

const defaultCreate: CreateSurface = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Sprites {
  cellNormal: HTMLCanvasElement | null = null;
  cellBright: HTMLCanvasElement | null = null;
  objects: HTMLCanvasElement[] = [];
  private builtKey = '';

  constructor(private readonly create: CreateSurface = defaultCreate) {}

  /** refSize: 칸 전체 한 변 (CSS px, 가장 큰 칸 기준). */
  build(refSize: number, dpr: number): void {
    const key = `${refSize.toFixed(2)}@${dpr}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    const px = Math.max(8, Math.round(refSize * dpr));
    this.cellNormal = this.buildCell(px, false);
    this.cellBright = this.buildCell(px, true);
    const c = VIEW_CONFIG.colors;
    this.objects = [
      this.buildBug(px, c.bug, VIEW_CONFIG.bugFill, false, false),
      this.buildBug(px, c.hard, VIEW_CONFIG.hardFill, true, false),
      this.buildBug(px, c.hard, VIEW_CONFIG.hardFill, true, true),
      this.buildBug(px, c.golden, VIEW_CONFIG.bugFill, false, false),
      this.buildGear(px, c.feature),
    ];
  }

  private surface(px: number, pad = 0): [HTMLCanvasElement, Ctx] {
    const side = Math.round(px * (1 + 2 * pad));
    const s = this.create(side, side);
    return [s, s.getContext('2d') as Ctx];
  }

  private buildCell(px: number, bright: boolean): HTMLCanvasElement {
    const c = VIEW_CONFIG;
    const [s, g] = this.surface(px);
    const inset = px * c.cellInset;
    const lw = Math.max(1, px * c.cellStroke);
    const w = px - inset * 2;
    g.beginPath();
    roundRectPath(g, inset + lw / 2, inset + lw / 2, w - lw, w - lw, px * c.cellCorner);
    g.fillStyle = rgba(c.cellColor, c.cellFillAlpha);
    g.fill();
    if (bright) {
      g.shadowColor = c.cellColor;
      g.shadowBlur = px * c.cellGlowBlur;
    }
    g.lineWidth = lw;
    g.strokeStyle = rgba(c.cellColor, bright ? c.cellBrightStrokeAlpha : c.cellStrokeAlpha);
    g.stroke();
    return s;
  }

  /** 공통 준비: 칸 중앙 원점, 단위 길이 u = px * fill. */
  private prep(px: number, hex: string, fill: number): [HTMLCanvasElement, Ctx, number] {
    const [s, g] = this.surface(px, VIEW_CONFIG.objectPad);
    const u = px * fill;
    g.translate(s.width / 2, s.height / 2);
    g.scale(u, u);
    g.shadowColor = hex;
    g.shadowBlur = px * VIEW_CONFIG.objectGlowBlur;
    g.lineWidth = VIEW_CONFIG.objectStroke;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    return [s, g, u];
  }

  private buildBug(px: number, hex: string, fill: number, hard: boolean, cracked: boolean): HTMLCanvasElement {
    const [s, g] = this.prep(px, hex, fill);
    const stroke = lighten(hex, VIEW_CONFIG.strokeLighten);
    g.strokeStyle = stroke;
    g.fillStyle = rgba(hex, VIEW_CONFIG.objectFillAlpha);
    g.translate(0, bugOffsetY());
    // 다리 6개
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const y = -0.12 + k * 0.22;
      const dy = (k - 1) * 0.12;
      for (const side of [-1, 1]) {
        g.moveTo(side * 0.3, y);
        g.lineTo(side * 0.5, y - 0.08 + dy * 0.2);
        g.lineTo(side * 0.64, y + 0.1 + dy);
      }
    }
    // 더듬이 2개
    for (const side of [-1, 1]) {
      g.moveTo(side * 0.08, -0.52);
      g.quadraticCurveTo(side * 0.18, -0.74, side * 0.3, -0.84);
    }
    g.stroke();
    // 머리
    g.beginPath();
    g.ellipse(0, -0.47, 0.17, 0.13, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 몸통
    g.beginPath();
    g.ellipse(0, 0.07, 0.4, 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (hard) {
      // 등껍질 2겹 외곽선
      g.lineWidth = VIEW_CONFIG.objectStroke * 0.7;
      g.beginPath();
      g.ellipse(0, 0.07, 0.28, 0.37, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (cracked) {
      g.strokeStyle = '#FFFFFF';
      g.lineWidth = VIEW_CONFIG.objectStroke * 0.6;
      g.beginPath();
      g.moveTo(-0.05, -0.36);
      g.lineTo(0.1, -0.18);
      g.lineTo(-0.08, -0.04);
      g.lineTo(0.12, 0.14);
      g.lineTo(-0.02, 0.3);
      g.lineTo(0.06, 0.52);
      g.stroke();
    } else if (!hard) {
      // 등 가운데 선
      g.lineWidth = VIEW_CONFIG.objectStroke * 0.5;
      g.beginPath();
      g.moveTo(0, -0.25);
      g.lineTo(0, 0.45);
      g.stroke();
    }
    return s;
  }

  /** 톱니바퀴: 이빨 8개 + 가운데 구멍. 버그(타원+다리)와 실루엣이 다르다. */
  private buildGear(px: number, hex: string): HTMLCanvasElement {
    const [s, g] = this.prep(px, hex, VIEW_CONFIG.featureFill);
    g.strokeStyle = lighten(hex, VIEW_CONFIG.strokeLighten);
    g.fillStyle = rgba(hex, VIEW_CONFIG.objectFillAlpha);
    const teeth = 8;
    const ro = 0.5;
    const ri = 0.37;
    g.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const step = (Math.PI * 2) / teeth;
      const pts: [number, number][] = [
        [ri, a0 - step * 0.28],
        [ro, a0 - step * 0.16],
        [ro, a0 + step * 0.16],
        [ri, a0 + step * 0.28],
      ];
      for (let j = 0; j < pts.length; j++) {
        const [r, a] = pts[j]!;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0 && j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 0.15, 0, Math.PI * 2);
    g.stroke();
    return s;
  }
}
