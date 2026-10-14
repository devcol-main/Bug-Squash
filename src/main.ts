const MAX_DPR = 2;
const BG_TOP = '#07020F';
const BG_BOTTOM = '#1D0634';

const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let gradient: CanvasGradient | null = null;
    let cssW = 0;
    let cssH = 0;

    const draw = (): void => {
      if (!gradient) return;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradient = ctx.createLinearGradient(0, 0, 0, cssH);
      gradient.addColorStop(0, BG_TOP);
      gradient.addColorStop(1, BG_BOTTOM);
      draw();
    };

    window.addEventListener('resize', resize);
    resize();
  }
}
