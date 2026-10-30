import type { Player } from '../core/types';
import type { StadiumSpec } from '../render/stadium';

/**
 * 攻撃時作戦コマンド（match_system_specification.md 3.1章）
 */
export type OffenseTactic =
  | 'NORMAL' // 通常
  | 'AGGRESSIVE' // ⚡ 積極打法（初球スイング+40%, 甘い球長打+25%）
  | 'OPPOSITE' // ➡️ 逆方向意識（流し打ち+60%, 外角コンタクト+20%）
  | 'LOW_BALL' // ⬇️ 低め見逃せ（低めボール球スイング-60%）
  | 'HIGH_BALL' // ⬆️ 高め見逃せ（高めボール球スイング-60%）
  | 'POWER' // 💥 強振（打球初速+10%, 本塁打+35%）
  | 'CONTACT' // 🎯 ミート重視（コンタクト+30%, 三振激減）
  | 'PATIENCE' // ✋ 待球（スイング0%, 投球数消費）
  | 'BUNT' // ⚾ 送りバント（進塁成功率85〜95%）
  | 'SAFETY_BUNT' // 🏃 セーフティバント（奇襲内野安打）
  | 'HIT_AND_RUN' // 🔥 ヒット＆ラン（併殺防止）
  | 'SQUEEZE' // 🚨 スクイズ（本塁生還特化）
  | 'STEAL'; // ⚡ 盗塁（単独スチール）

/**
 * 守備時守備シフト（match_system_specification.md 3.2章）
 */
export type DefenseShift =
  | 'NORMAL' // 定位置（通常）
  | 'FORWARD' // 前進守備（本塁生還阻止）
  | 'DOUBLE_PLAY' // 併殺シフト（ゲッツー重視）
  | 'DEEP_OUTFIELD' // 外野長打警戒（頭上越え阻止）
  | 'BUNT_DEFENSE'; // バント警戒（バント・スクイズ阻止）

/**
 * 守備時作戦コマンド
 */
export type DefenseCommand =
  | 'NORMAL'
  | 'CAUTION_RUNNER' // 🚨 ランナー警戒（クイックモーション、盗塁阻止率+35%）
  | 'INTENTIONAL_WALK' // ✋ 申告敬遠
  | 'MESSAGE'; // 📣 伝令（スタミナ+10%回復、動揺解除、最大3回）

/**
 * 打席結果タイル
 */
export type PaResultTile = 'HIT' | 'OUT' | 'BB' | 'HBP' | 'HR' | '2B' | '3B' | 'ERR';

/**
 * トラッキングHUDデータ（TRK-STATS）
 */
export interface TrackingStats {
  pitchType: string;
  pitchSpeedKmh: number;
  pitchZone: 'HIGH_IN' | 'HIGH_OUT' | 'LOW_IN' | 'LOW_OUT' | 'CENTER' | 'BALL';
  exitVelocityKmh?: number; // 打球初速（km/h）
  launchAngleDeg?: number; // 打球角度（度）
  trajectoryType?: 'GROUNDER' | 'LINER' | 'FLY' | 'POPOUT' | 'HOMERUN';
  hitDistanceMeters?: number; // 飛距離（m）
}

/**
 * 1球ごとの投球・打席判定結果
 */
export interface PitchOutcome {
  pitchType: string;
  speedKmh: number;
  ballResult: 'BALL' | 'CALLED_STRIKE' | 'SWINGING_STRIKE' | 'FOUL' | 'IN_PLAY' | 'INTENTIONAL_WALK' | 'DEADBALL';
  inPlayOutcome?: '1B' | '2B' | '3B' | 'HR' | 'GROUNDOUT' | 'FLYOUT' | 'LINEOUT' | 'ERROR' | 'DOUBLE_PLAY' | 'SAC_BUNT' | 'SAC_FLY';
  runsScored: number;
  outsAdded: number;
  description: string;
  tracking: TrackingStats;
}

/**
 * 投手の実戦ステータス
 */
export interface LivePitcherState {
  player: Player;
  pitches: number;
  stamina: number;
  maxStamina: number;
  earnedRuns: number;
  hitsAllowed: number;
  strikeouts: number;
  walks: number;
}

/**
 * 走者状況
 */
export interface LiveBases {
  b1: Player | null;
  b2: Player | null;
  b3: Player | null;
}

/**
 * チーム実戦構成
 */
export interface LiveTeam {
  id: string;
  name: string;
  prefecture: string;
  isPlayerTeam: boolean;
  capColor: string;
  shirtColor: string;
  pantsColor: string;
  underShirtColor: string;
  lineup: Player[];
  lineupPositions: string[];
  bench: Player[];
  pitcher: LivePitcherState;
  pitcherIndex: number;
  bullpen: Player[];
  currentBatterIndex: number; // 0..8
  batterHistory: Record<string, PaResultTile[]>;
  messagesLeft: number; // 伝令残回数（最大3）
}

/**
 * 個人打撃ボックススコア
 */
export interface BatterBoxScore {
  playerId: string;
  name: string;
  position: string;
  orderNumber: number;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  strikeouts: number;
  walks: number;
  hitByPitch?: number;
  homeRuns: number;
}

/**
 * 個人投手ボックススコア
 */
export interface PitcherBoxScore {
  playerId: string;
  name: string;
  inningsPitched: number; // 1/3単位は .33, .66 で表現
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  hitByPitch?: number;
  strikeouts: number;
  pitches: number;
}

/**
 * リアルタイム試合進行状態
 */
export interface LiveMatchState {
  matchId: string;
  tournamentTitle: string;
  roundName: string;
  stadium: StadiumSpec;
  teamA: LiveTeam; // 先攻
  teamB: LiveTeam; // 後攻
  inning: number; // 1..30
  isBottom: boolean; // false = 表(A攻撃), true = 裏(B攻撃)
  outs: number; // 0..2
  balls: number; // 0..3
  strikes: number; // 0..2
  scoreA: number;
  scoreB: number;
  lineScoreA: number[];
  lineScoreB: number[];
  hitsA: number;
  hitsB: number;
  errorsA: number;
  errorsB: number;
  bases: LiveBases;
  offenseTactic: OffenseTactic;
  defenseShift: DefenseShift;
  defenseAlert: boolean; // 走者警戒
  lastPitch: PitchOutcome | null;
  speed: 1.0 | 1.5 | 2.0;
  autoPauseEnabled: boolean;
  autoPauseTrigger: string | null;
  isGameOver: boolean;
  winnerTeamId: string | null;
  boxScoreA: Record<string, BatterBoxScore>;
  boxScoreB: Record<string, BatterBoxScore>;
  pitcherBoxA: Record<string, PitcherBoxScore>;
  pitcherBoxB: Record<string, PitcherBoxScore>;
  playLog: string[];
}
