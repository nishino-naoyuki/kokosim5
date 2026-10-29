import { applyDailyGrowth, type GrowthContext } from './growth';
import { injuryTriggersSafetyStop, processFatigueDay } from './fatigue';
import type { Rng } from './rng';
import type { AbilityKey, Injury, Player, TrainingMenu } from './types';

export interface TrainingDayOptions {
  isSunday: boolean;
  facility?: GrowthContext['facility'];
  groundBonus?: number;
  /** 負けず嫌いのモチベーション状態にある選手ID */
  motivatedPlayerIds?: ReadonlySet<string>;
  /** OB臨時コーチの指定練習（成長率2倍）がこの週有効なメニュー */
  obCoachMenu?: TrainingMenu;
}

export interface TrainingDayReport {
  injuries: { playerId: string; injury: Injury }[];
  gains: Map<string, Partial<Record<AbilityKey, number>>>;
  /** 中等度以上のケガ発生 → 日程自動停止 */
  safetyStop: boolean;
}

/**
 * 全部員の1日分の練習（成長 → 疲労・ケガ）を処理する。
 * 順序：ケガ判定 → （ケガをしなければ）成長 → 疲労反映。
 * ケガ中の選手は成長せず、強制休養。
 */
export function processTrainingDay(
  roster: Player[],
  assignments: ReadonlyMap<string, TrainingMenu>,
  opts: TrainingDayOptions,
  rng: Rng,
): TrainingDayReport {
  const report: TrainingDayReport = { injuries: [], gains: new Map(), safetyStop: false };

  // 同じ練習枠にキャプテン肌がいるメニュー（本人以外へオーラ）
  const leadersByMenu = new Map<TrainingMenu, Set<string>>();
  for (const p of roster) {
    if (p.personality !== 'LEADER' || p.injury) continue;
    const menu = assignments.get(p.id) ?? 'REST';
    if (!leadersByMenu.has(menu)) leadersByMenu.set(menu, new Set());
    leadersByMenu.get(menu)!.add(p.id);
  }

  for (const player of roster) {
    const menu = assignments.get(player.id) ?? 'REST';
    const wasInjured = player.injury !== null;
    const result = processFatigueDay(player, menu, opts.isSunday, rng.fork(`fatigue/${player.id}`));

    if (result.injury) {
      report.injuries.push({ playerId: player.id, injury: result.injury });
      if (injuryTriggersSafetyStop(result.injury)) report.safetyStop = true;
      continue; // 当日発症：成長なし
    }
    if (wasInjured || menu === 'REST') continue;

    const leaders = leadersByMenu.get(menu);
    const leaderAura = !!leaders && (leaders.size > 1 || !leaders.has(player.id));
    const gains = applyDailyGrowth(player, {
      menu,
      facility: opts.facility,
      groundBonus: opts.groundBonus,
      motivated: opts.motivatedPlayerIds?.has(player.id) ?? false,
      leaderAura,
      extraBoost: opts.obCoachMenu === menu ? 2.0 : 1.0,
    });
    report.gains.set(player.id, gains);
  }
  return report;
}
