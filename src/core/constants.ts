import type { AbilityKey, GrowthType, Grade, Personality, TrainingMenu } from './types';

/** 性格の出現率（%）と表示名 — training_and_growth_specification.md 2章 */
export const PERSONALITY_TABLE: Record<Personality, { label: string; weight: number }> = {
  DILIGENT: { label: '努力家', weight: 20 },
  HOTBLOODED: { label: '熱血漢', weight: 15 },
  COOL: { label: '冷静・クール', weight: 15 },
  CRAFTSMAN: { label: '職人気質', weight: 12 },
  COMPETITIVE: { label: '負けず嫌い', weight: 10 },
  MOODMAKER: { label: 'ムードメーカー', weight: 10 },
  LEADER: { label: 'キャプテン肌', weight: 8 },
  MYPACE: { label: 'マイペース', weight: 5 },
  SHY: { label: '内気・シャイ', weight: 4 },
  GENIUS: { label: '天才肌', weight: 1 },
};

/** 成長タイプの出現率（%）と学年別成長率 — 同 3章 */
export const GROWTH_TYPE_TABLE: Record<
  GrowthType,
  { label: string; weight: number; byGrade: Record<Grade, number> }
> = {
  SUPER_EARLY: { label: '超早熟', weight: 5, byGrade: { 1: 1.4, 2: 0.9, 3: 0.6 } },
  EARLY: { label: '早熟', weight: 15, byGrade: { 1: 1.2, 2: 1.1, 3: 0.8 } },
  NORMAL: { label: '普通', weight: 60, byGrade: { 1: 0.9, 2: 1.0, 3: 1.1 } },
  LATE: { label: '晩成', weight: 15, byGrade: { 1: 0.7, 2: 1.0, 3: 1.4 } },
  SUPER_LATE: { label: '超晩成', weight: 5, byGrade: { 1: 0.5, 2: 0.8, 3: 1.8 } },
};

/** 基礎成長基準値（1日あたり）— 同 4.1 BaseGrowth */
export const BASE_GROWTH = 0.06;

/** 練習メニューごとのメイン／サブ対象能力 — 設計書 2.1 / 同 4.1 M_menu */
export const MENU_TARGETS: Record<TrainingMenu, { main: AbilityKey[]; sub: AbilityKey[] }> = {
  BATTING: { main: ['power', 'contact', 'eye'], sub: ['judgment'] },
  INFIELD: { main: ['fielding', 'reaction', 'judgment', 'control'], sub: ['arm'] },
  OUTFIELD: { main: ['speed', 'accel', 'arm'], sub: ['judgment', 'reaction'] },
  PITCHING: { main: ['arm', 'form', 'control', 'breaking'], sub: ['stamina', 'guts'] },
  PHYSICAL: { main: ['guts', 'stamina'], sub: ['power', 'arm', 'speed'] },
  REST: { main: [], sub: [] },
};

export const MENU_LABELS: Record<TrainingMenu, string> = {
  BATTING: '打撃強化',
  INFIELD: '内野守備',
  OUTFIELD: '外野・機動',
  PITCHING: '投手陣',
  PHYSICAL: 'フィジカル・特守',
  REST: '休養・ケア',
};

/** メイン対象 1.0、サブ対象 0.3〜0.5 の中央値 */
export const SUB_TARGET_RATIO = 0.4;

/** 疲労：メニュー別の1日あたり変動幅（%）— 同 5.1 */
export const FATIGUE_DELTA: Record<TrainingMenu, readonly [number, number]> = {
  BATTING: [8, 10],
  INFIELD: [8, 10],
  OUTFIELD: [8, 10],
  PITCHING: [12, 15],
  PHYSICAL: [20, 25],
  REST: [-45, -35],
};

/** 日曜日（週次自動休養）の疲労回復量 */
export const SUNDAY_RECOVERY = 20;

/** 疲労度帯ごとの1日あたりケガ発生率 — 同 5.2 */
export function injuryRateByFatigue(fatigue: number): number {
  if (fatigue >= 100) return 0.25;
  if (fatigue >= 80) return 0.08;
  if (fatigue >= 60) return 0.01;
  return 0;
}

/** ケガの重さ — 同 5.3 */
export const INJURY_TABLE = [
  { severity: 'MINOR', weight: 70, days: [3, 5] },
  { severity: 'MODERATE', weight: 28, days: [10, 21] },
  { severity: 'SEVERE', weight: 2, days: [30, 60] },
] as const;
