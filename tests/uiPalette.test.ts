// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @types/node 없이 파일을 읽는다(vitest의 css ?raw는 빈 문자열이라 사용 불가).
import { readFileSync } from 'node:fs';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8').toLowerCase();
const files = { 'ui.css': read('../src/ui/ui.css'), 'index.html': read('../index.html') };
// 금지 색을 두 조각으로 나눠 적는다(저장소 grep에 이 테스트 파일이 걸리지 않게).
const hex = (a: string, b: string): string => `#${a}${b}`;
const FORBIDDEN = [hex('ff3c', 'c8'), hex('ff7a', 'd9'), hex('c9a8', 'ff'), hex('33e1', 'ff'), hex('0702', '0f'), hex('8a7a', 'a8'), hex('d9c8', 'ff'), hex('ffd2', '3c'), hex('ff9a', '3c'), `rgba(${255}, ${60}, 200`, `rgba(${201}, ${168}, 255`, `rgba(5, ${0}, 12`, `rgba(255, ${122}, 217`];

describe('Stack Up palette leftovers', () => {
  for (const name of ['ui.css', 'index.html'] as const) {
    it(`${name} contains no Stack Up purple/pink colors`, () => {
      const text = files[name];
      for (const c of FORBIDDEN) expect(text, c).not.toContain(c);
    });
  }
  it('index.html has no SVG diamond life icons', () => {
    expect(files['index.html']).not.toContain('<svg');
  });
  it('ui.css no longer defines the unused gold variable', () => {
    expect(files['ui.css']).not.toContain('--term-gold');
  });
  it('ui.css defines the terminal colors as CSS variables', () => {
    const css = files['ui.css'];
    for (const v of ['--term-green: #39ff88', '--term-dim: #1e5c38', '--term-amber: #ffb000', '--term-red: #ff3b3b', '--term-bg: #050a07', '--term-dim-text: #3a9a62']) expect(css).toContain(v);
  });
});
