/**
 * 選手・学校のドメイン型定義。
 * 設計書 2.1（育成）/ 3.1〜3.2（学校・新入生）/ player_character_design.md に準拠。
 */

/** 選手能力（全項目 0〜100）。球速は肩×フォームから算出（abilities.ts）。 */
export const ABILITY_KEYS = [
  'power', // 長打力
  'contact', // ミート力
  'eye', // 選球眼
  'speed', // 走力
  'accel', // 加速（隠しパラメータ）
  'fielding', // 捕球力
  'guts', // 度胸
  'arm', // 肩の強さ
  'control', // コントロール
  'form', // 投球フォーム
  'judgment', // 判断力
  'reaction', // 反応速度
  'breaking', // 変化球キレ（平均）
  'stamina', // スタミナ・基礎体力
] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type Abilities = Record<AbilityKey, number>;

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  power: '長打力',
  contact: 'ミート力',
  eye: '選球眼',
  speed: '走力',
  accel: '加速',
  fielding: '捕球力',
  guts: '度胸',
  arm: '肩の強さ',
  control: 'コントロール',
  form: '投球フォーム',
  judgment: '判断力',
  reaction: '反応速度',
  breaking: '変化球',
  stamina: 'スタミナ',
};

/** 10大性格 */
export type Personality =
  | 'DILIGENT' // 努力家
  | 'HOTBLOODED' // 熱血漢
  | 'COOL' // 冷静・クール
  | 'CRAFTSMAN' // 職人気質
  | 'COMPETITIVE' // 負けず嫌い
  | 'MOODMAKER' // ムードメーカー
  | 'LEADER' // キャプテン肌
  | 'MYPACE' // マイペース
  | 'SHY' // 内気・シャイ
  | 'GENIUS'; // 天才肌

/** 5大成長タイプ */
export type GrowthType = 'SUPER_EARLY' | 'EARLY' | 'NORMAL' | 'LATE' | 'SUPER_LATE';

export type Grade = 1 | 2 | 3;

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';

export type Handedness = 'R' | 'L';
export type BatSide = 'R' | 'L' | 'S';

/** 練習メニュー（カンバンボード6枠） */
export type TrainingMenu = 'BATTING' | 'INFIELD' | 'OUTFIELD' | 'PITCHING' | 'PHYSICAL' | 'REST';

export type InjurySeverity = 'MINOR' | 'MODERATE' | 'SEVERE';

export interface Injury {
  severity: InjurySeverity;
  /** 残り治療日数 */
  daysRemaining: number;
  /** 発症時の総治療日数 */
  totalDays: number;
}

/** 怪物ルーキー種別 */
export type MonsterKind = 'PITCHER' | 'BATTER';

export interface PlayerName {
  family: string;
  given: string;
}

export interface Player {
  id: string;
  name: PlayerName;
  /** 64bit の顔シード（16桁の16進文字列。JSON保存可能） */
  faceSeed: string;
  grade: Grade;
  position: Position;
  throws: Handedness;
  bats: BatSide;
  personality: Personality;
  growthType: GrowthType;
  abilities: Abilities;
  /** 調子 -5〜+5 */
  condition: number;
  /** 疲労度 0〜100 */
  fatigue: number;
  injury: Injury | null;
  /** 特性（特殊能力・金特） */
  traits: string[];
  monster?: MonsterKind;
}

/** ユニフォームデザイン（設計書 2.1 UniformDesign） */
export interface UniformDesign {
  style: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE' | 'CLASSIC_OPEN';
  capColor: string;
  capBrimColor?: string;
  helmetColor?: string;
  shirtColor: string;
  pantsColor: string;
  underShirtColor: string;
  accentLineColor?: string;
  socksType: 'PLAIN' | 'ONE_LINE' | 'TWO_LINE';
  socksBaseColor: string;
  socksLineColor?: string;
  numberColor: string;
}

/** 全国高校マスタ（設計書 3.x / school_master_and_tournament_specification.md 2.1） */
export interface SchoolMaster {
  id: string;
  name: string;
  prefecture: string;
  district: string;
  isPublic: boolean;
  /** 基準戦力値 0〜100 */
  baseRating: number;
  /** 戦力安定度 0〜100 */
  stability: number;
  /** 名声度 0〜100（Rank E〜S） */
  reputation: number;
  uniform: UniformDesign;
}

export type ReputationRank = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

export function reputationRank(reputation: number): ReputationRank {
  if (reputation >= 90) return 'S';
  if (reputation >= 75) return 'A';
  if (reputation >= 60) return 'B';
  if (reputation >= 40) return 'C';
  if (reputation >= 20) return 'D';
  return 'E';
}
