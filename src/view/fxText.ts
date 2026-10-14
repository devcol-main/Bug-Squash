// 글로우 텍스트 스프라이트 캐시. shadowBlur 는 스프라이트를 만들 때(처음 쓸 때 1회)만 쓴다.
// 리사이즈/DPR 변경(build) 또는 폰트 로드 후(invalidateTextCache)에 비운다.
import { VIEW_CONFIG } from './viewConfig';

const FX = VIEW_CONFIG.fx;
export const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';

/** 텍스트 스타일 index. */
export const TextStyle = { Score: 0, Golden: 1, Banner: 2 } as const;

export interface TextSprite {
  canvas: HTMLCanvasElement;
  /** 스프라이트의 CSS px 크기 (그릴 때 이 크기로 drawImage). 글로우 패딩 포함. */
  w: number;
  h: number;
  /** 글자 폭만 (패딩 제외, CSS px). */
  textW: number;
  /** 글자 높이만 (대문자/숫자 높이 근사, 글로우 패딩과 줄 간격 제외, CSS px). 스프라이트 세로 가운데 기준. */
  textH: number;
}

type CreateSurface = (w: number, h: number) => HTMLCanvasElement;
const defaultCreate: CreateSurface = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class TextCache {
  private readonly maps: Map<string, TextSprite>[] = [new Map(), new Map(), new Map()];
  /** 배너 접두사 스프라이트: [글자 수] = 접두사 + 커서 `_`. noCursor = 전체 문자열(커서 없음). build 시점에 미리 만들고 이후 배열 조회만 한다. */
  private readonly bannerPrefix: (TextSprite | undefined)[] = [];
  private bannerNoCursor: TextSprite | undefined;
  private measureCtx: CanvasRenderingContext2D | null = null;
  private boardSize = 0;
  private dpr = 1;

  constructor(private readonly create: CreateSurface = defaultCreate) {}

  build(boardSize: number, dpr: number): void {
    this.boardSize = boardSize;
    this.dpr = dpr;
    this.measureCtx = null;
    this.invalidateTextCache();
    // 플레이 중 첫 사용 끊김을 없애기 위해 가능한 문자열을 미리 만든다.
    for (const t of FX.scoreTexts) this.get(TextStyle.Score, t);
    for (const t of FX.goldenTexts) this.get(TextStyle.Golden, t);
    for (let n = 0; n <= FX.bannerText.length; n++) this.banner(n, true);
    this.banner(FX.bannerText.length, false);
  }

  /** 배너의 앞 n글자 (+ 커서). 같은 n이면 항상 같은 스프라이트. 없으면 한 번 그려서 캐시한다. */
  banner(n: number, cursor: boolean): TextSprite {
    const len = FX.bannerText.length;
    const k = Math.max(0, Math.min(len, n));
    if (cursor || k < len) return (this.bannerPrefix[k] ??= this.draw(TextStyle.Banner, FX.bannerText.slice(0, k) + '_'));
    return (this.bannerNoCursor ??= this.draw(TextStyle.Banner, FX.bannerText));
  }

  invalidateTextCache(): void {
    for (const m of this.maps) m.clear();
    this.bannerPrefix.length = 0;
    this.bannerNoCursor = undefined;
  }

  /** 없으면 한 번 그려서 캐시한다. 이후 같은 문자열은 Map 조회만 한다. */
  get(style: number, text: string): TextSprite {
    const m = this.maps[style] as Map<string, TextSprite>;
    let s = m.get(text);
    if (!s) {
      s = this.draw(style, text);
      m.set(text, s);
    }
    return s;
  }

  private draw(style: number, text: string): TextSprite {
    const banner = style === TextStyle.Banner;
    const fontPx = Math.max(8, this.boardSize * (banner ? FX.bannerFont : FX.popupFont / 3));
    const color = banner ? FX.bannerColor : style === TextStyle.Golden ? FX.goldenTextColor : FX.scoreColor;
    const glow = banner ? FX.bannerGlow : style === TextStyle.Golden ? FX.goldenTextGlow : FX.scoreGlow;
    const blur = fontPx * (banner ? FX.bannerGlowRatio : FX.popupGlow);
    const font = `bold ${fontPx}px ${FONT_FAMILY}`;
    const measure = (this.measureCtx ??= this.create(1, 1).getContext('2d') as CanvasRenderingContext2D);
    measure.font = font;
    const tw = measure.measureText(text).width;
    const pad = Math.ceil(blur * 2);
    const w = Math.ceil(tw) + pad * 2;
    const h = Math.ceil(fontPx * 1.3) + pad * 2;
    const surf = this.create(Math.ceil(w * this.dpr), Math.ceil(h * this.dpr));
    const g = surf.getContext('2d') as CanvasRenderingContext2D;
    g.scale(this.dpr, this.dpr);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.shadowColor = glow;
    g.shadowBlur = blur;
    // 글로우를 진하게: 두 번 겹쳐 그린다.
    g.fillText(text, w / 2, h / 2);
    g.fillText(text, w / 2, h / 2);
    return { canvas: surf, w, h, textW: Math.max(1, tw), textH: fontPx * 0.7 };
  }
}
