import {
  BASE_GROWTH,
  GROWTH_TYPE_TABLE,
  MENU_TARGETS,
  SUB_TARGET_RATIO,
} from './constants';
import { clamp } from './rng';
import { ABILITY_KEYS, type AbilityKey, type Player, type TrainingMenu } from './types';

/** 成長計算に必要な外部コンテキスト */
export interface GrowthContext {
  menu: TrainingMenu;
  /** 設備倍率（能力ごと、未所持=1.0、所持=1.15〜1.35） */
  facility?: Partial<Record<AbilityKey, number>>;
  /** 黒土・グラウンド整備による加算（+0.10） */
  groundBonus?: number;
  /** 負けず嫌い用：敗戦後／レギュラー剥奪直後のモチベーション状態 */
  motivated?: boolean;
  /** 同じ練習枠にキャプテン肌の部員がいる場合 */
  leaderAura?: boolean;
  /** OB臨時コーチ等による成長率ブースト（既定 1.0） */
  extraBoost?: number;
}

/** 調子係数（M_condition）— 仕様 4.1 */
export function conditionMultiplier(condition: number): number {
  const c = clamp(Math.round(condition), -5, 5);
  if (c === 5) return 1.2;
  if (c === -5) return 0.8;
  if (c === 0) return 1.0;
  if (c > 0) return 1.05 + ((c - 1) / 3) * 0.1; // +1:1.05 … +4:1.15
  return 0.95 - ((-c - 1) / 3) * 0.1; // -1:0.95 … -4:0.85
}

/** メニュー適合度（M_menu）: メイン=1.0 / サブ=0.4 / 無関係=0 */
export function menuMultiplier(menu: TrainingMenu, ability: AbilityKey): number {
  const t = MENU_TARGETS[menu];
  if (t.main.includes(ability)) return 1.0;
  if (t.sub.includes(ability)) return SUB_TARGET_RATIO;
  return 0;
}

const COOL_ABILITIES: AbilityKey[] = ['control', 'eye', 'judgment'];
const CRAFT_ABILITIES: AbilityKey[] = ['breaking', 'fielding', 'contact'];

/** 性格係数（M_personality）— 仕様 2章 */
export function personalityMultiplier(
  player: Pick<Player, 'personality' | 'grade' | 'condition'>,
  ability: AbilityKey,
  ctx: Pick<GrowthContext, 'menu' | 'motivated'>,
): number {
  switch (player.personality) {
    case 'DILIGENT':
      return 1.15;
    case 'HOTBLOODED':
      return ctx.menu === 'PHYSICAL' ? 1.35 : 1.0;
    case 'COOL':
      return COOL_ABILITIES.includes(ability) ? 1.3 : 1.0;
    case 'CRAFTSMAN':
      return CRAFT_ABILITIES.includes(ability) ? 1.35 : 0.85;
    case 'COMPETITIVE':
      return ctx.motivated ? 1.4 : 1.0;
    case 'MOODMAKER':
      if (player.condition >= 3) return 1.4;
      if (player.condition <= -3) return 0.8;
      return 1.0;
    case 'SHY':
      return player.grade === 1 ? 0.85 : 1.0;
    case 'GENIUS':
      return 1.3;
    case 'LEADER':
    case 'MYPACE':
    default:
      return 1.0;
  }
}

/** 設備・機材倍率（M_facility）— 仕様 4.1 */
export function facilityMultiplier(ctx: GrowthContext, ability: AbilityKey): number {
  return (ctx.facility?.[ability] ?? 1.0) + (ctx.groundBonus ?? 0);
}

/**
 * 1日あたりの能力上昇量 ΔP を計算する。
 * ΔP = BaseGrowth × M_menu × M_type × M_personality × M_condition × M_facility
 */
export function dailyGain(player: Player, ability: AbilityKey, ctx: GrowthContext): number {
  const mMenu = menuMultiplier(ctx.menu, ability);
  if (mMenu === 0) return 0;
  const mType = GROWTH_TYPE_TABLE[player.growthType].byGrade[player.grade];
  const mPersonality = personalityMultiplier(player, ability, ctx);
  const mCondition = conditionMultiplier(player.condition);
  const mFacility = facilityMultiplier(ctx, ability);
  const aura = ctx.leaderAura ? 1.1 : 1.0;
  const boost = ctx.extraBoost ?? 1.0;
  return BASE_GROWTH * mMenu * mType * mPersonality * mCondition * mFacility * aura * boost;
}

/** 1日分の練習成長を選手へ反映し、各能力の上昇量を返す */
export function applyDailyGrowth(
  player: Player,
  ctx: GrowthContext,
): Partial<Record<AbilityKey, number>> {
  const gains: Partial<Record<AbilityKey, number>> = {};
  for (const key of ABILITY_KEYS) {
    const gain = dailyGain(player, key, ctx);
    if (gain <= 0) continue;
    const before = player.abilities[key];
    const after = Math.min(100, before + gain);
    player.abilities[key] = after;
    gains[key] = after - before;
  }
  return gains;
}
