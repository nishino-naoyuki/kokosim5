import { FATIGUE_DELTA, INJURY_TABLE, SUNDAY_RECOVERY, injuryRateByFatigue } from './constants';
import { clamp, type Rng } from './rng';
import type { Injury, Player, TrainingMenu } from './types';

export type FatigueZone = 'SAFE' | 'CAUTION' | 'DANGER' | 'LIMIT';

/** 疲労度帯（緑／黄／赤枠／紫）— 仕様 5.2 */
export function fatigueZone(fatigue: number): FatigueZone {
  if (fatigue >= 100) return 'LIMIT';
  if (fatigue >= 80) return 'DANGER';
  if (fatigue >= 60) return 'CAUTION';
  return 'SAFE';
}

/** 1日分の疲労増減量（%ポイント）。熱血漢 +15% / マイペース -25%（増加分のみ）。 */
export function fatigueDelta(player: Pick<Player, 'personality'>, menu: TrainingMenu, rng: Rng): number {
  const [lo, hi] = FATIGUE_DELTA[menu];
  let delta = rng.float(lo, hi);
  if (delta > 0) {
    if (player.personality === 'HOTBLOODED') delta *= 1.15;
    if (player.personality === 'MYPACE') delta *= 0.75;
  }
  return delta;
}

/** ケガ判定。発生した場合は Injury を返す。休養メニューでは発生しない。 */
export function rollInjury(fatigueAtStart: number, menu: TrainingMenu, rng: Rng): Injury | null {
  if (menu === 'REST') return null;
  if (!rng.chance(injuryRateByFatigue(fatigueAtStart))) return null;
  const entry = rng.weighted(INJURY_TABLE.map((e) => [e, e.weight] as const));
  const days = rng.int(entry.days[0], entry.days[1]);
  return { severity: entry.severity, daysRemaining: days, totalDays: days };
}

/** 中等度以上のケガは日程進行を自動停止（Safety Stop）させる */
export function injuryTriggersSafetyStop(injury: Injury): boolean {
  return injury.severity !== 'MINOR';
}

export interface FatigueDayResult {
  injury: Injury | null;
}

/**
 * 1日の疲労処理（疲労蓄積・日曜自動回復・ケガ判定・治療日数の消化）を選手へ反映する。
 * ケガ中の選手は強制的に休養扱いとなる。
 */
export function processFatigueDay(
  player: Player,
  menu: TrainingMenu,
  isSunday: boolean,
  rng: Rng,
): FatigueDayResult {
  // ケガ中：強制休養。治療日数を消化。
  if (player.injury) {
    player.fatigue = clamp(player.fatigue + fatigueDelta(player, 'REST', rng), 0, 100);
    player.injury.daysRemaining -= 1;
    if (player.injury.daysRemaining <= 0) player.injury = null;
    return { injury: null };
  }

  const fatigueAtStart = player.fatigue;
  const injury = rollInjury(fatigueAtStart, menu, rng);
  if (injury) {
    player.injury = injury;
    player.fatigue = clamp(player.fatigue + fatigueDelta(player, 'REST', rng), 0, 100);
  } else {
    player.fatigue = clamp(player.fatigue + fatigueDelta(player, menu, rng), 0, 100);
  }
  if (isSunday) player.fatigue = clamp(player.fatigue - SUNDAY_RECOVERY, 0, 100);
  return { injury };
}
