import type { BugSquashConfig } from './config';

/** 콤보 -> 배율. 구간 경계는 config.comboTiers (기본 5/10/20 -> x2/x3/x4). */
export function multiplierForCombo(combo: number, cfg: Pick<BugSquashConfig, 'comboTiers'>): number {
  let m = 1;
  for (const t of cfg.comboTiers) if (combo >= t) m++;
  return m;
}
