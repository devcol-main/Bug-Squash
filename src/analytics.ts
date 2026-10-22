// devcol.net 애널리틱스 연동. 사이트의 /t.js가 window.devcol을 만든다.
// t.js가 없거나(로컬 dev, 애드블록, DNT) 오류가 나도 게임은 그대로 동작해야 하므로 항상 조용히 무시한다.
// game_start(첫 로드)와 플레이 시간(page_leave)은 t.js가 /games/<slug>/ 경로에서 자동으로 보낸다.
export type AnalyticsProps = Record<string, string | number | boolean | null>;

interface DevcolAnalytics {
  track(type: string, props?: AnalyticsProps): void;
}

export function track(type: 'stage_clear' | 'game_over', props: AnalyticsProps): void {
  try {
    (globalThis as { devcol?: DevcolAnalytics }).devcol?.track(type, props);
  } catch {
    // 무시
  }
}

/** Bug Squash의 stage: 1 = 3x3 보드, 2 = 4x4로 확장된 뒤. */
export function stageOf(state: { boardSize: number }, largeBoardSize: number): number {
  return state.boardSize >= largeBoardSize ? 2 : 1;
}
