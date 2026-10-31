import { sfx } from '../../audio/sfx';
import { pitchVelocity } from '../../core/abilities';
import { Rng } from '../../core/rng';
import type { Player } from '../../core/types';
import { game, touch } from '../../game/state';
import { renderAvatarSvg } from '../../render/avatarSvg';
import { initMatch3D, type CameraViewMode, type Match3DScene, isRealisticPitchEasingActive, setRealisticPitchEasing } from '../../render/match3d';
import type { PitchingFormType } from '../../render/matchPlayers';
import { choosePracticeStadium, type StadiumSpec } from '../../render/stadium';
import {
  changePitcher,
  createLiveMatch,
  issueIntentionalWalk,
  pinchHit,
  sendMessenger,
  simulateNineInnings,
  simulateMultipleMatches,
  stepPitch,
  type SimResult,
} from '../../match/engine';
import type { DefenseShift, LiveBases, LiveMatchState, OffenseTactic, PitchOutcome } from '../../match/types';
import { actions, closeModal, go, openModal, registerActions, requestRender, shell, toast } from '../core';
import { esc } from '../format';
import { calloutOverlay, type CalloutKind } from '../CalloutOverlay';

export type MatchScreenState = 'PRE_ORDER' | 'LIVE_3D' | 'RESULT';

let matchScreenState: MatchScreenState = 'PRE_ORDER';
let activeMatch: LiveMatchState | null = null;
let match3d: Match3DScene | null = null;
let isAnimating = false;
let pendingCalloutPromise: Promise<void> | null = null;
let autoPlayTimer: number | null = null;
let isTacticsDrawerOpen = false;
let selectedSubCandidateId: string | null = null;
const matchRng = new Rng(`match-${Date.now()}`);

const OFFENSE_TACTIC_LABELS: Record<OffenseTactic, string> = {
  NORMAL: '通常（サインなし）',
  AGGRESSIVE: '⚡ 積極打法',
  OPPOSITE: '➡️ 逆方向意識',
  LOW_BALL: '⬇️ 低め見逃せ',
  HIGH_BALL: '⬆️ 高め見逃せ',
  POWER: '💥 強振',
  CONTACT: '🎯 ミート重視',
  PATIENCE: '✋ 待球（待て）',
  BUNT: '⚾ 送りバント',
  SAFETY_BUNT: '🏃 セーフティバント',
  HIT_AND_RUN: '🔥 ヒット＆ラン',
  SQUEEZE: '🚨 スクイズ',
  STEAL: '⚡ 盗塁',
};

const DEFENSE_SHIFT_LABELS: Record<DefenseShift, string> = {
  NORMAL: '通常シフト',
  FORWARD: '前進守備',
  DOUBLE_PLAY: '併殺シフト',
  DEEP_OUTFIELD: '長打警戒',
  BUNT_DEFENSE: 'バント警戒',
};

// 案B：3D骨格ボーン連続フォーム ＆ フォームエディタ確認デモ用ステート
type DevModalTab = 'SIMULATION' | 'FORM_EDITOR' | 'BATTER_EDITOR' | 'EFFECTS_TEST';
let devModalActiveTab: DevModalTab = 'SIMULATION';
let batterDemoPhase = 0.0;
let batterDemoHandedness: 'R' | 'L' = 'R';
let batterStageLabel = '① 構え (Stance: 投手凝視・静止)';

interface PitcherDevParams {
  arm: number;
  form: number;
  control: number;
  breaking: number;
  stamina: number;
  guts: number;
  condition: number;
  throws: 'R' | 'L';
}

let devPitcherParams: PitcherDevParams = {
  arm: 50,
  form: 50,
  control: 50,
  breaking: 50,
  stamina: 50,
  guts: 50,
  condition: 0,
  throws: 'R',
};

let devSimResult: SimResult | null = null;

/** 開発チート機能：スライダーで設定した投手パラメータをマウンド上の登板中投手に即時同期 */
function syncDevPitcherToLiveMatch(): void {
  if (!activeMatch) return;
  const pitchingTeam = activeMatch.isBottom ? activeMatch.teamA : activeMatch.teamB;
  const pitcher = pitchingTeam.pitcher?.player;
  if (pitcher) {
    pitcher.abilities.arm = devPitcherParams.arm;
    pitcher.abilities.form = devPitcherParams.form;
    pitcher.abilities.control = devPitcherParams.control;
    pitcher.abilities.breaking = devPitcherParams.breaking;
    pitcher.abilities.stamina = devPitcherParams.stamina;
    pitcher.abilities.guts = devPitcherParams.guts;
    pitcher.condition = devPitcherParams.condition;
    pitcher.throws = devPitcherParams.throws;
  }
  demoThrows = devPitcherParams.throws;
  match3d?.setPitcherThrows(demoThrows);
}

let demoForm: PitchingFormType = 'OVERHAND_HIGH';
let demoThrows: 'R' | 'L' = 'R';
let demoCameraMode: CameraViewMode = 'PITCH_VIEW';
let demoPhase = 0.0;
let isFormEditorOpen = false;
let demoJerseyNumber = 1;
let demoUniformPattern: 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE' = 'ACCENT_LINE';
let demoColorPreset = 'SEIUN';
let demoColorMaskMode = false;
let demoModifiers: {
  legLiftHeight: number;
  pelvisSinkDepth: number;
  armSlotOffsetDeg: number;
  torsoTiltOffsetDeg: number;
  strideLengthScale: number;
} = {
  legLiftHeight: 1.0,
  pelvisSinkDepth: 1.0,
  armSlotOffsetDeg: 0,
  torsoTiltOffsetDeg: 0,
  strideLengthScale: 1.0,
};

// 投球・打球トラッキング表示ステート (infield_ground_wide.jpg の TRK-STATS)
let isTrackingVisible = false;
let trackingData = {
  pitchType: '146 km/h スライダー',
  avgPitch: '145 km/h',
  exitVelocity: '152 km/h',
  launchAngle: '6°',
};

// ドラマチックプレーバナー表示ステート (infield_ground_closeup.jpg)
let isDramaticBannerVisible = false;
let dramaticBannerText = 'DRAMATIC PLAY! SHORTSTOP [6]';

// テレビ中継スピードガン演出用ステート
interface RadarPitchState {
  speed: number;
  pitchName: string;
}
let currentRadarPitch: RadarPitchState | null = null;
let speedGunTimer: number | null = null;

const PITCH_NAME_JA: Record<string, string> = {
  FOUR_SEAM: 'ストレート',
  STRAIGHT: 'ストレート',
  TWO_SEAM: 'ツーシーム',
  CUTTER: 'カットボール',
  SLIDER: 'スライダー',
  CURVE: 'カーブ',
  SLOW_CURVE: 'スローカーブ',
  FORK: 'フォーク',
  SPLIT: 'SFF (スプリット)',
  CHANGEUP: 'チェンジアップ',
  SINKER: 'シンカー',
  KNUCKLE: 'ナックル',
};

async function triggerImpactFeedback(outcome: PitchOutcome): Promise<void> {
  // 1. 効果音 (Web Audio API)
  if (outcome.ballResult === 'IN_PLAY') {
    const isHR = outcome.inPlayOutcome === 'HR';
    sfx.playBatHit(isHR);
    if (outcome.inPlayOutcome === '1B' || outcome.inPlayOutcome === '2B' || outcome.inPlayOutcome === '3B' || isHR) {
      setTimeout(() => sfx.playCallChime('HIT'), 60);
    } else {
      setTimeout(() => sfx.playCallChime('OUT'), 60);
    }
  } else if (outcome.ballResult === 'FOUL') {
    sfx.playBatHit(false);
  } else if (outcome.ballResult === 'CALLED_STRIKE' || outcome.ballResult === 'SWINGING_STRIKE') {
    sfx.playMittCatch();
    setTimeout(() => sfx.playCallChime('STRIKE'), 50);
  } else {
    // BALL
    sfx.playMittCatch();
    setTimeout(() => sfx.playCallChime('BALL'), 50);
  }

  // 2. スピードガン（Radar Gun）表示 - 次の投球まで常時維持
  const pName = PITCH_NAME_JA[outcome.pitchType] || outcome.pitchType || 'ストレート';
  const speed = Math.round(outcome.speedKmh || 142);
  currentRadarPitch = { speed, pitchName: pName };
  const speedEl = document.getElementById('tv-speed-gun');
  if (speedEl) {
    speedEl.innerHTML = `
      <div class="sg-label">RADAR PITCH</div>
      <div class="sg-val">${speed}<span class="sg-unit">km/h</span></div>
      <div class="sg-type">${pName}</div>
    `;
    speedEl.classList.remove('hidden', 'fade-out', 'pulse-pop');
    void speedEl.offsetWidth; // リフローしてアニメーション再トリガー
    speedEl.classList.add('visible', 'pulse-pop');
    if (speedGunTimer !== null) {
      clearTimeout(speedGunTimer);
      speedGunTimer = null;
    }
  }

  // 3. ダイナミック・コールアウト ＆ 特大スコア演出
  if (outcome.runsScored > 0) {
    const isPushOut = outcome.description.includes('四球') || outcome.ballResult === 'INTENTIONAL_WALK';
    const isHR = outcome.ballResult === 'IN_PLAY' && outcome.inPlayOutcome === 'HR';
    const badgeText = isPushOut ? '押し出し得点！' : isHR ? 'ホームラン得点！' : 'タイムリー得点！';

    await calloutOverlay.showBigScore({
      teamAName: activeMatch ? activeMatch.teamA.name : '九工大',
      teamBName: activeMatch ? activeMatch.teamB.name : '翔青',
      scoreA: activeMatch ? activeMatch.scoreA : 1,
      scoreB: activeMatch ? activeMatch.scoreB : 0,
      badgeText,
      durationMs: 2000,
    });
  } else {
    let kind: CalloutKind = 'STRIKE';
    let sub = '';

    if (
      outcome.description.includes('三振') ||
      (outcome.outsAdded > 0 && (outcome.ballResult === 'SWINGING_STRIKE' || outcome.ballResult === 'CALLED_STRIKE'))
    ) {
      kind = 'STRIKEOUT';
      sub = outcome.ballResult === 'SWINGING_STRIKE' ? '空振り三振！' : '見逃し三振！';
    } else if (outcome.ballResult === 'INTENTIONAL_WALK' || outcome.description.includes('四球')) {
      kind = 'WALK';
      sub = 'フォアボール！出塁';
    } else if (outcome.description.includes('死球') || outcome.description.includes('デッドボール')) {
      kind = 'DEADBALL';
      sub = '死球で出塁！';
    } else if (outcome.ballResult === 'IN_PLAY') {
      if (outcome.inPlayOutcome === 'HR') {
        kind = 'HOMERUN';
        sub = '甲子園スタンド直撃 本塁打!!';
      } else if (outcome.inPlayOutcome === '3B') {
        kind = 'TRIPLE';
        sub = '右中間を深々と破る三塁打!';
      } else if (outcome.inPlayOutcome === '2B') {
        kind = 'DOUBLE';
        sub = '左中間フェンス直撃 二塁打!';
      } else if (outcome.inPlayOutcome === '1B') {
        kind = 'HIT';
        sub = 'クリーンヒット!';
      } else if (outcome.inPlayOutcome === 'DOUBLE_PLAY') {
        kind = 'DOUBLE_PLAY';
        sub = '電光石火の併殺打 4-6-3!!';
      } else if (outcome.inPlayOutcome === 'SAC_BUNT') {
        kind = 'SAC_BUNT';
        sub = '手堅い送りバント成功';
      } else if (outcome.inPlayOutcome === 'ERROR') {
        kind = 'HIT';
        sub = '相手失策による出塁!';
      } else {
        kind = 'OUT';
        sub = outcome.inPlayOutcome === 'FLYOUT' ? '外野フライ捕球アウト' : '内野ゴロ送球アウト';
      }
    } else if (outcome.ballResult === 'SWINGING_STRIKE') {
      kind = 'SWINGING_STRIKE';
      sub = '豪快な空振りストライク！';
    } else if (outcome.ballResult === 'CALLED_STRIKE') {
      kind = 'STRIKE';
      sub = 'ズバッと見逃しストライク！';
    } else if (outcome.ballResult === 'FOUL') {
      kind = 'FOUL';
      sub = 'スタンドへ切れるファウル';
    } else {
      kind = 'BALL';
      sub = '見送ってボール';
    }

    await calloutOverlay.showCallout(kind, { subText: sub });
  }

  // 4. 画面インパクト演出（長打・ホームランの瞬間フラッシュ＆微細シェイク）
  if (outcome.ballResult === 'IN_PLAY' && (outcome.inPlayOutcome === 'HR' || outcome.inPlayOutcome === '2B' || outcome.inPlayOutcome === '3B')) {
    const stage = document.getElementById('viewport-stage') || document.getElementById('app');
    if (stage) {
      stage.classList.remove('impact-shake');
      void stage.offsetWidth; // re-flow
      stage.classList.add('impact-shake');
      setTimeout(() => stage.classList.remove('impact-shake'), 400);
    }
  }
}

// スタメンオーダー編成用ステート
let preOrderSelectedIdx: number | null = null;
let preOrderPreset = 'LEFTP_SHIFT'; // 'BASIC' | 'LEFTP_SHIFT' | 'SPEED' | 'SLUGGER' | 'DEFENSE'
let customLineupOrder: string[] | null = null;

export function getActiveMatch(): LiveMatchState | null {
  return activeMatch;
}

export function setMatchScreenState(state: MatchScreenState): void {
  matchScreenState = state;
}

/** 日本式スコア記法（koshien_pitch_final.jpg の打席タイル完全再現） */
function toJapaneseScoreTile(outcome: string): { label: string; isRed: boolean } {
  switch (outcome) {
    case 'HR': return { label: '本塁打', isRed: true };
    case '3B': return { label: '三塁打', isRed: true };
    case '2B': return { label: '二塁打', isRed: true };
    case '1B':
    case 'HIT': return { label: '右安', isRed: true };
    case 'BB': return { label: '四球', isRed: false };
    case 'K': return { label: '三振', isRed: false };
    case 'GROUNDOUT': return { label: '二ゴ', isRed: false };
    case 'FLYOUT': return { label: '中飛', isRed: false };
    case 'DOUBLE_PLAY': return { label: '併殺', isRed: false };
    case 'SAC_BUNT': return { label: '犠打', isRed: false };
    case 'SAC_FLY': return { label: '犠飛', isRed: false };
    case 'ERROR':
    case 'ERR': return { label: '失策', isRed: false };
    default: return { label: outcome, isRed: false };
  }
}

/** 5段階調子アイコン（pre_match_order_screen.jpg 完全再現） */
function renderConditionIcon(cond: number): string {
  if (cond >= 2) return `<span class="cond-icon red" title="絶好調">↑</span>`;
  if (cond === 1) return `<span class="cond-icon orange" title="好調">↗</span>`;
  if (cond === 0) return `<span class="cond-icon yellow" title="普通">→</span>`;
  if (cond === -1) return `<span class="cond-icon blue" title="不調">↘</span>`;
  return `<span class="cond-icon purple" title="絶不調">↓</span>`;
}

/** 能力値アルファベットランク */
function abilityRank(val: number): { rank: string; color: string } {
  if (val >= 90) return { rank: 'S', color: '#e11d48' };
  if (val >= 80) return { rank: 'A', color: '#ea580c' };
  if (val >= 70) return { rank: 'B', color: '#d97706' };
  if (val >= 60) return { rank: 'C', color: '#16a34a' };
  if (val >= 50) return { rank: 'D', color: '#2563eb' };
  return { rank: 'E', color: '#64748b' };
}

function fmtRankVal(val: number): string {
  const n = Math.round(val);
  const r = abilityRank(n);
  return `<span class="stat-cell"><b style="color:${r.color};margin-right:2px">${r.rank}</b>${n}</span>`;
}

/**
 * 簡易的な相手チーム名簿生成
 */
function createOpponentRoster(prefix: string): Player[] {
  const positions: Player['position'][] = ['P', 'P', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C', '1B', 'SS', 'CF'];
  return positions.map((pos, idx) => ({
    id: `opp_${idx + 1}`,
    name: { family: prefix, given: `選手${idx + 1}` },
    grade: ((idx % 3) + 1) as 1 | 2 | 3,
    position: pos,
    throws: idx === 0 ? 'L' : 'R', // 先発は左腕
    bats: idx % 2 === 0 ? 'R' : 'L',
    personality: 'COOL',
    growthType: 'NORMAL',
    faceSeed: `opp${(1000 + idx * 37).toString(16).padStart(13, '0')}`,
    abilities: {
      power: 62 + (idx % 25),
      contact: 65 + (idx % 20),
      eye: 64 + (idx % 18),
      speed: 68 + (idx % 15),
      accel: 60,
      fielding: 66 + (idx % 20),
      arm: pos === 'P' ? 82 : 65,
      reaction: 65,
      judgment: 64,
      control: pos === 'P' ? 74 : 50,
      stamina: pos === 'P' ? 84 : 50,
      breaking: pos === 'P' ? 76 : 30,
      form: 50,
      guts: 68,
    },
    fatigue: 0,
    injury: null,
    traits: pos === 'P' ? ['マウンドの威圧感', 'キレ味鋭いスライダー'] : idx === 3 ? ['パワーヒッター'] : [],
    condition: 0,
  }));
}

/**
 * 練習試合または公式戦を開始して試合画面へ遷移する
 */
export function startExhibitionMatch(stadiumOverride?: StadiumSpec): void {
  currentRadarPitch = null;
  const s = game();
  const playerSchool = s.school;

  const oppSchool = {
    id: 'rival_high',
    name: playerSchool.prefecture === '福岡県' ? '九州国際大付' : '大阪桐蔭',
    prefecture: playerSchool.prefecture,
    isPlayerTeam: false,
    uniform: {
      capColor: '#1e3a8a',
      shirtColor: '#f8fafc',
      pantsColor: '#f8fafc',
      underShirtColor: '#1e3a8a',
    },
    roster: createOpponentRoster(playerSchool.prefecture === '福岡県' ? '九国' : '桐蔭'),
  };

  const stadium = stadiumOverride ?? choosePracticeStadium(matchRng, playerSchool.name);

  // カスタムオーダーが設定されている場合、自校ロスターの先頭9名を入れ替え
  let myLineup = s.roster;
  if (customLineupOrder && customLineupOrder.length >= 9) {
    const customStarters = customLineupOrder.map(id => s.roster.find(p => p.id === id)!).filter(Boolean);
    const customBench = s.roster.filter(p => !customStarters.some(st => st.id === p.id));
    myLineup = [...customStarters, ...customBench];
  }

  activeMatch = createLiveMatch({
    matchId: `m-${Date.now()}`,
    tournamentTitle: '福岡大会 準決勝 第1試合',
    roundName: '準決勝',
    stadium,
    teamA: {
      id: oppSchool.id,
      name: oppSchool.name,
      prefecture: oppSchool.prefecture,
      isPlayerTeam: false,
      roster: oppSchool.roster,
      uniform: oppSchool.uniform,
    },
    teamB: {
      id: playerSchool.id,
      name: playerSchool.name,
      prefecture: playerSchool.prefecture,
      isPlayerTeam: true,
      roster: myLineup,
      uniform: {
        capColor: playerSchool.uniform.capColor,
        shirtColor: playerSchool.uniform.shirtColor,
        pantsColor: playerSchool.uniform.pantsColor,
        underShirtColor: playerSchool.uniform.underShirtColor,
      },
    },
  });

  if (autoPlayTimer !== null) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
  }
  if (match3d) {
    match3d.dispose();
    match3d = null;
  }
  isAnimating = false;
  isTacticsDrawerOpen = false;
  matchScreenState = 'LIVE_3D';
  go('match');
}

/**
 * 画面左下のミニ球場ダイヤモンドSVG（公認野球規則の寸法比率 ＆ 全5種守備シフト完全準拠）
 * - 本塁(105, 140), 1塁(132, 113), 2塁(105, 86), 3塁(78, 113), マウンド(105, 114.5)
 * - 内野ダート境界（グラスライン）: マウンド中心・半径42（2塁ベース後方 y=72.5 まで広がる実寸比率）
 */
function renderMiniDiamondSvg(shift: DefenseShift, bases: LiveBases): string {
  // ① 定位置（通常シフト）: 内野4人は全員が2塁ベース〜1・3塁ベース後方の「土（ダート）エリア内」に配置
  // ※一塁走者がいる場合は牽制のため一塁手が一塁ベース付近に付く
  let pos1B = bases.b1 ? { x: 130, y: 111 } : { x: 132, y: 101 };
  let pos2B = { x: 120, y: 81 };
  let posSS = { x: 89, y: 79 };
  let pos3B = { x: 77, y: 102 };
  let posLF = { x: 58, y: 50 };
  let posCF = { x: 105, y: 33 };
  let posRF = { x: 152, y: 50 };

  if (shift === 'FORWARD') {
    // ② 前進守備（本塁生還阻止）: 内野4人がベースライン手前（芝生エッジ付近）へ前進、外野もやや浅め
    pos1B = { x: 123, y: 112 };
    pos2B = { x: 115, y: 93 };
    posSS = { x: 95, y: 93 };
    pos3B = { x: 87, y: 112 };
    posLF = { x: 62, y: 57 };
    posCF = { x: 105, y: 41 };
    posRF = { x: 148, y: 57 };
  } else if (shift === 'DOUBLE_PLAY') {
    // ③ 併殺シフト（ゲッツー態勢）: 二遊間が二塁ベース方向へ寄り一歩前へ、1Bはベース付き（走者一塁時）
    pos1B = bases.b1 ? { x: 130, y: 111 } : { x: 131, y: 102 };
    pos2B = { x: 114, y: 82 };
    posSS = { x: 96, y: 82 };
    pos3B = { x: 77, y: 103 };
  } else if (shift === 'DEEP_OUTFIELD') {
    // ④ 長打警戒（外野深め・ライン際警戒）: 外野3人がフェンス手前まで大きく後退、一・三塁手もライン際深め
    pos1B = bases.b1 ? { x: 130, y: 111 } : { x: 135, y: 99 };
    pos2B = { x: 121, y: 79 };
    posSS = { x: 89, y: 78 };
    pos3B = { x: 75, y: 99 };
    posLF = { x: 50, y: 39 };
    posCF = { x: 105, y: 21 };
    posRF = { x: 160, y: 39 };
  } else if (shift === 'BUNT_DEFENSE') {
    // ⑤ バント警戒（バント・スクイズ阻止）: 1B・3Bが内野芝生内側へ猛チャージ、2Bが一塁カバー、SSが二塁（二塁走者時は三塁）カバー
    pos1B = { x: 119, y: 121 };
    pos3B = { x: 91, y: 121 };
    pos2B = { x: 125, y: 98 };
    posSS = bases.b2 ? { x: 86, y: 99 } : { x: 103, y: 85 };
    posLF = { x: 62, y: 58 };
    posCF = { x: 105, y: 44 };
    posRF = { x: 148, y: 58 };
  }

  const b1Col = bases.b1 ? '#f59e0b' : '#ffffff';
  const b2Col = bases.b2 ? '#f59e0b' : '#ffffff';
  const b3Col = bases.b3 ? '#f59e0b' : '#ffffff';

  const renderFielderPin = (x: number, y: number) => `
    <g transform="translate(${x}, ${y})">
      <ellipse cx="0" cy="4.6" rx="3.8" ry="1.3" fill="rgba(0,0,0,0.42)"/>
      <path d="M -3.5,4.2 L -1.9,0 L 1.9,0 L 3.5,4.2 M -4,1.2 L 4,1.2" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M -3.5,4.2 L -1.9,0 L 1.9,0 L 3.5,4.2 M -4,1.2 L 4,1.2" stroke="#ffffff" stroke-width="1.35" stroke-linecap="round"/>
      <circle cx="0" cy="-2.3" r="2.3" fill="#fde68a" stroke="#0f172a" stroke-width="1.1"/>
      <path d="M -2.3,-2.5 A 2.3,2.3 0 0,1 2.3,-2.5 Z" fill="#1e293b"/>
    </g>
  `;

  return `
  <svg viewBox="0 0 210 154" width="100%" height="100%" style="display:block">
    <defs>
      <!-- 外野芝生の刈り込み縦ストライプ -->
      <pattern id="minimap-lawn-stripes" width="14" height="154" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="7" height="154" fill="#2d6e32"/>
        <rect x="7" y="0" width="7" height="154" fill="#38823d"/>
      </pattern>
      <!-- 球場全体（フェア＋ファウルグラウンド）クリップパス -->
      <clipPath id="minimap-field-clip">
        <path d="M 21,56 A 100,100 0 0,1 189,56 L 164,112 L 124,148 L 86,148 L 46,112 Z"/>
      </clipPath>
    </defs>

    <!-- 1. 球場全体グラウンド（芝生＋外野ウォーニングトラック） -->
    <g clip-path="url(#minimap-field-clip)">
      <rect x="0" y="0" width="210" height="154" fill="url(#minimap-lawn-stripes)"/>
      <path d="M 19,56 A 102,102 0 0,1 191,56" fill="none" stroke="#6d4827" stroke-width="7"/>
      <path d="M 19,56 A 102,102 0 0,1 191,56" fill="none" stroke="#3f2712" stroke-width="1.4"/>
    </g>

    <!-- 2. 内野ダート（マウンド中心・半径42の実寸比率円弧：2塁ベースの奥までしっかり広がる土エリア） -->
    <path d="M 105,140 L 65.4,100.4 A 42,42 0 0,1 144.6,100.4 Z" fill="#7c502d" stroke="#5c381c" stroke-width="0.8"/>
    <!-- 本塁ダートサークル -->
    <circle cx="105" cy="140" r="8.5" fill="#7c502d"/>

    <!-- 3. 内野ダイヤモンド芝生（ベース間内側の芝） -->
    <polygon points="105,135 127.5,113 105,90.5 82.5,113" fill="#357d3b"/>

    <!-- 4. ピッチャーズマウンド（内野芝生の上に描画） -->
    <circle cx="105" cy="114.5" r="5.6" fill="#7c502d" stroke="#5c381c" stroke-width="0.6"/>
    <rect x="103" y="113.8" width="4" height="1.4" fill="#ffffff"/>

    <!-- 5. ファウルライン ＆ 内野ベースライン（白線） -->
    <line x1="105" y1="140" x2="23" y2="58" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="105" y1="140" x2="187" y2="58" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
    <polyline points="78,113 105,86 132,113" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1"/>

    <!-- 6. コーチャーズボックス ＆ バッターボックス -->
    <path d="M 140,111 L 146,111 L 146,120 L 140,120" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="0.75"/>
    <path d="M 70,111 L 64,111 L 64,120 L 70,120" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="0.75"/>
    <rect x="99.5" y="137" width="3.2" height="5.8" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.6"/>
    <rect x="107.3" y="137" width="3.2" height="5.8" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="0.6"/>

    <!-- 7. 各ベース（1塁・2塁・3塁・本塁：走者出塁時はゴールド点灯） -->
    <rect x="129.6" y="110.6" width="4.8" height="4.8" fill="${b1Col}" stroke="#0f172a" stroke-width="0.5" transform="rotate(45 132 113)"/>
    <rect x="102.6" y="83.6" width="4.8" height="4.8" fill="${b2Col}" stroke="#0f172a" stroke-width="0.5" transform="rotate(45 105 86)"/>
    <rect x="75.6" y="110.6" width="4.8" height="4.8" fill="${b3Col}" stroke="#0f172a" stroke-width="0.5" transform="rotate(45 78 113)"/>
    <polygon points="105,142.2 107.3,139.9 107.3,137.8 102.7,137.8 102.7,139.9" fill="#ffffff"/>

    <!-- 8. 守備選手9名（P, C, 1B, 2B, 3B, SS, LF, CF, RF） -->
    ${renderFielderPin(105, 114)}
    ${renderFielderPin(105, 146)}
    ${renderFielderPin(pos1B.x, pos1B.y)}
    ${renderFielderPin(pos2B.x, pos2B.y)}
    ${renderFielderPin(pos3B.x, pos3B.y)}
    ${renderFielderPin(posSS.x, posSS.y)}
    ${renderFielderPin(posLF.x, posLF.y)}
    ${renderFielderPin(posCF.x, posCF.y)}
    ${renderFielderPin(posRF.x, posRF.y)}
  </svg>`;
}

// ---------------------------------------------------------------------------
// 1. 試合前オーダー作成画面 (pre_match_order_screen.jpg の完全再現)
// ---------------------------------------------------------------------------
export function renderPreMatchOrderScreen(): string {
  const s = game();
  const school = s.school;

  // スタメン9名の決定（カスタムまたは初期9名）
  const roster = s.roster;
  let starters: Player[] = [];
  if (customLineupOrder && customLineupOrder.length >= 9) {
    starters = customLineupOrder.map(id => roster.find(p => p.id === id)!).filter(Boolean);
  }
  if (starters.length < 9) {
    starters = roster.slice(0, 9);
  }

  const bench = roster.filter(p => !starters.some(st => st.id === p.id));

  // スタメンテーブルの行生成
  const lineupRowsHtml = starters.map((p, idx) => {
    const isSelected = preOrderSelectedIdx === idx;
    const bAb = p.abilities;
    const traitStr = p.traits.join('・') || (idx === 0 ? '走力S・盗塁A・内野安打○ スイッチ' : idx === 3 ? 'パワーヒッター・威圧感・通算42発' : idx === 8 ? 'エース・最速154km/h・奪三振◎' : '俊足巧打・堅実守備');
    const avg = idx === 3 ? '.418 3本' : idx === 0 ? '.358 0本' : idx === 8 ? '防0.75' : `.3${10 + idx * 8} ${idx % 2}本`;

    return `
    <tr class="po-row ${isSelected ? 'selected' : ''}" data-act="po-select-row" data-idx="${idx}">
      <td class="po-num-cell"><span class="po-num-badge">${idx + 1}</span></td>
      <td><span class="pos-badge ${p.position === 'P' ? 'p' : 'f'}">${p.position}</span></td>
      <td class="po-jersey">#${idx === 8 ? '1' : String(idx + 2)}</td>
      <td class="po-name-cell">
        <b>${esc(p.name.family)} ${esc(p.name.given)}</b>
        <span class="po-grade">${p.grade}年</span>
      </td>
      <td class="po-throw-bat">${p.throws === 'R' ? '右' : '左'}${p.bats === 'R' ? '右' : p.bats === 'L' ? '左' : '両'}</td>
      <td class="po-cond-cell">${renderConditionIcon(p.condition)}</td>
      <td>${fmtRankVal(bAb.contact)}</td>
      <td>${fmtRankVal(bAb.power)}</td>
      <td>${fmtRankVal(bAb.speed)}</td>
      <td>${fmtRankVal(bAb.arm)}</td>
      <td>${fmtRankVal(bAb.fielding)}</td>
      <td class="po-avg">${avg}</td>
      <td class="po-traits" title="${esc(traitStr)}">${esc(traitStr)}</td>
    </tr>`;
  }).join('');

  // ベンチ控え行（役割タグ付き）
  const roleTags = ['セットアッパー', 'ワンポイント左腕', '第2捕手', '代打の切り札', '内野ユーティリティ', '代走の切り札', '外野守備固め'];
  const benchRowsHtml = bench.slice(0, 7).map((p, idx) => {
    const role = roleTags[idx % roleTags.length];
    return `
    <div class="po-bench-item">
      <div class="po-b-num">#${10 + idx}</div>
      <div class="po-b-main">
        <div class="po-b-title">
          <b>${esc(p.name.family)} ${esc(p.name.given)}</b>
          <span class="po-grade">(${p.grade}年 / ${p.position})</span>
          ${renderConditionIcon(p.condition)}
        </div>
        <div class="po-b-sub">${idx === 0 ? '最速144km/h・制球力A' : idx === 3 ? '【代打○】代打打率.450' : idx === 5 ? '【走力S】盗塁◎・俊足' : '守備職人・適性◎'}</div>
      </div>
      <div class="po-b-role-badge">${role}</div>
    </div>`;
  }).join('');

  const bodyHtml = `
  <div class="pre-order-screen">
    <!-- 最上部ヘッダーバー (pre_match_order_screen.jpg) -->
    <div class="pre-order-top-banner">
      <div class="po-title">⚔️ 試合前オーダー作成 ＆ 本日のスタメン決定</div>
      <div class="po-match-badge">[福岡大会 準決勝 第1試合 vs九国大付]</div>
      <div class="po-env-pill">球場: 春日公園野球場 / 天候: 快晴 32℃ / 試合開始 10分前</div>
      <div class="po-home-away">先攻: 九州国際大付 / 後攻: ${esc(school.name)} (自校)</div>
    </div>

    <!-- 相手先発投手スカウト＆戦術メモバー (pre_match_order_screen.jpg) -->
    <div class="po-scout-reminder-box">
      <div class="po-scout-left">
        <div class="scout-line">
          <span class="scout-bullet">■ 相手先発投手情報:</span>
          <b>小手川 拓也 (3年 / 左投左打)</b>
          <span class="scout-meta">最速148km/h・キレ味鋭いスライダー武器・調子: [普通 →]</span>
        </div>
        <div class="scout-line">
          <span class="scout-bullet">■ 監督戦術メモ:</span>
          <span class="scout-memo">「相手は左腕の好投手。右打者を多く並べるか、外角スライダーを見極められる選球眼の良い打者を上位に配置するのが有効！」</span>
        </div>
      </div>
      <div class="po-scout-right">
        <button class="po-assist-btn" data-act="po-optimize-left">🎯 対左投手 最適化設定</button>
        <button class="po-assist-btn" data-act="po-optimize-condition">⚡ 調子優先 スタメン自動設定</button>
      </div>
    </div>

    <!-- メイン2カラムグリッド -->
    <div class="po-main-grid">
      <!-- 左カラム：本日のスターティングラインナップ (スタメン9名) -->
      <div class="po-left-col">
        <div class="po-sec-head">
          <span>本日のスターティングラインナップ (スタメン9名 & 先発投手)</span>
          <small class="po-head-tip">※行クリックで打順入れ替え / ダブルクリックで控えと交代</small>
        </div>

        <div class="po-table-wrap">
          <table class="po-table">
            <thead>
              <tr>
                <th>打順</th><th>位置</th><th>背番</th><th>氏名 / 学年</th><th>投打</th><th>調子</th>
                <th>ミート</th><th>パワー</th><th>走力</th><th>肩力</th><th>守備</th><th>大会打率</th><th>主な特殊能力・特徴</th>
              </tr>
            </thead>
            <tbody>
              ${lineupRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- スタメン総合戦力値 ＆ プリセットオーダー -->
        <div class="po-summary-box">
          <div class="po-summary-power">
            <span>スタメン総合戦力値: チーム打力 <b style="color:#ea580c">A (89)</b> / 機動力 <b style="color:#e11d48">S (93)</b> / 守備力 <b style="color:#ea580c">A (90)</b> / チーム調子: <b style="color:#dc2626">【極めて良好 ↑】</b></span>
          </div>
          <div class="po-pitchers-relay">
            <span>先発投手: <b>#1 神崎 晴樹</b> (最速154km/h / 調子: 絶好調) | 第2先発: <b>#9 成瀬</b> | 抑え: <b>#10 佐々木</b></span>
          </div>
          <div class="po-presets-row">
            <span class="po-preset-lbl">オーダー呼出:</span>
            <button class="po-preset-pill ${preOrderPreset === 'BASIC' ? 'active' : ''}" data-act="po-preset" data-val="BASIC">基本オーダー</button>
            <button class="po-preset-pill ${preOrderPreset === 'LEFTP_SHIFT' ? 'active' : ''}" data-act="po-preset" data-val="LEFTP_SHIFT">対左腕シフト (本日推奨)</button>
            <button class="po-preset-pill ${preOrderPreset === 'SPEED' ? 'active' : ''}" data-act="po-preset" data-val="SPEED">機動破壊重視</button>
            <button class="po-preset-pill ${preOrderPreset === 'SLUGGER' ? 'active' : ''}" data-act="po-preset" data-val="SLUGGER">長打一発狙い</button>
            <button class="po-preset-pill ${preOrderPreset === 'DEFENSE' ? 'active' : ''}" data-act="po-preset" data-val="DEFENSE">守備固め重視</button>
          </div>
          <div class="po-tactical-note">
            ※本日は相手左腕・小手川投手を想定し、2番に俊足の五十嵐、5番に右の勝負師・坂本を据えた「対左腕シフト」を適用中。<br>
            打順の入れ替えは、入れ替えたい2つの行を連続クリックしてください。控え選手との交代は右側のベンチから選択します。
          </div>
        </div>
      </div>

      <!-- 右カラム：ベンチ入り控え部員 ＆ 采配方針 ＆ 試合開始巨大ボタン -->
      <div class="po-right-col">
        <!-- ベンチ部員カード -->
        <div class="po-sec-head">
          <span>ベンチ入り控え部員 (11名) & 采配方針</span>
          <span class="po-tag-pill">ベンチ20名枠</span>
        </div>
        <div class="po-bench-list">
          ${benchRowsHtml}
        </div>

        <!-- 本日の基本作戦方針（監督指示） -->
        <div class="po-policy-box">
          <div class="po-policy-title">本日の基本作戦方針 (監督指示)</div>
          <div class="po-policy-item"><b>打撃方針:</b> 【ミート重視 & 待球徹底】 <small>(外角球を見極め球数を投げさせる)</small></div>
          <div class="po-policy-item"><b>走塁方針:</b> 【積極盗塁】 <small>(早坂・五十嵐の快足で相手左腕を揺さぶる)</small></div>
          <div class="po-policy-item"><b>守備陣形:</b> 【長打警戒シフト】 <small>(4番馬原・5番石川には外野深め位置)</small></div>
          <div class="po-policy-item"><b>継投方針:</b> 【エース完投視野も7回以降リリーフ準備】 <small>(球数100球を目処)</small></div>
        </div>

        <!-- 巨大試合開始ボタン (pre_match_order_screen.jpg) -->
        <div class="po-action-wrap">
          <button class="btn-playball" data-act="start-playball">
            <span class="pb-icon">⚾</span>
            <span class="pb-text">プレイボール！ 試合開始 ▶</span>
          </button>
          <div class="po-sub-tip">※オーダー決定後、甲子園予選準決勝が開始されます</div>
          <button class="po-back-link" data-act="go" data-to="main">[メイン画面に戻る]</button>
        </div>
      </div>
    </div>
  </div>`;

  return shell('match', '試合前オーダー作成 ＆ 本日のスタメン決定', bodyHtml);
}

// ---------------------------------------------------------------------------
// 2. 3D試合画面 (koshien_pitch_final.jpg + infield_ground_wide.jpg の完全再現)
// ---------------------------------------------------------------------------
export function renderMatchScreen(): string {
  if (matchScreenState === 'PRE_ORDER' || !activeMatch) {
    return renderPreMatchOrderScreen();
  }

  if (matchScreenState === 'RESULT') {
    return renderOfficialResultScreen();
  }

  const m = activeMatch;
  const isPlayerBatting = (m.isBottom && m.teamB.isPlayerTeam) || (!m.isBottom && m.teamA.isPlayerTeam);
  const battingTeam = m.isBottom ? m.teamB : m.teamA;
  const pitchingTeam = m.isBottom ? m.teamA : m.teamB;

  const batter = battingTeam.lineup[battingTeam.currentBatterIndex % battingTeam.lineup.length];
  const pitcherState = pitchingTeam.pitcher;
  const pitcher = pitcherState.player;

  // 1. トップスコアボード（koshien_pitch_complete.jpg の完全比率再現）
  const kanjiA = m.teamA.name.slice(0, 1);
  const kanjiB = m.teamB.name.slice(0, 1);

  const bsoAndRunnersHtml = `
    <div class="sb-bso-wrap">
      <!-- 左列：BSOランプ -->
      <div class="bso-col">
        <div class="bso-item"><span class="k">B</span><i class="dot b ${m.balls >= 1 ? 'on' : ''}"></i><i class="dot b ${m.balls >= 2 ? 'on' : ''}"></i><i class="dot b ${m.balls >= 3 ? 'on' : ''}"></i></div>
        <div class="bso-item"><span class="k">S</span><i class="dot s ${m.strikes >= 1 ? 'on' : ''}"></i><i class="dot s ${m.strikes >= 2 ? 'on' : ''}"></i></div>
        <div class="bso-item"><span class="k">O</span><i class="dot o ${m.outs >= 1 ? 'on' : ''}"></i><i class="dot o ${m.outs >= 2 ? 'on' : ''}"></i></div>
      </div>
      <!-- 右列：立体金色走者ダイヤモンド -->
      <div class="sb-runners-col">
        <div class="score-runners-diamond">
          <div class="r-dot b2 ${m.bases.b2 ? 'on' : ''}"></div>
          <div class="r-dot b3 ${m.bases.b3 ? 'on' : ''}"></div>
          <div class="r-dot b1 ${m.bases.b1 ? 'on' : ''}"></div>
        </div>
      </div>
    </div>`;

  // 2. 左側：投手HUDカード（ERA, Pitches, STAMINAバー）
  const stamRatio = Math.max(0, Math.min(1, pitcherState.stamina / pitcherState.maxStamina));
  const era = (pitcherState.earnedRuns * 9) / Math.max(1, pitcherState.pitches / 15);
  const eraFormatted = era > 0 ? era.toFixed(2) : '1.85';

  // 3. 右側：打者HUDカード（AVG, HR, 4つの打席結果タイル）
  const contact = batter.abilities?.contact ?? 60;
  const power = batter.abilities?.power ?? 55;
  const avgFormatted = (0.220 + (contact / 100) * 0.120).toFixed(3).replace(/^0/, '');
  const hrFormatted = Math.max(0, Math.floor((power - 35) / 12));

  const history = battingTeam.batterHistory[batter.id] || [];
  const tiles: { label: string; isRed: boolean }[] = [];
  for (let i = 0; i < history.length; i++) {
    tiles.push(toJapaneseScoreTile(history[i]));
  }
  // 設計図 koshien_pitch_complete.jpg の打席履歴例に準拠
  const defaultSampleTiles = [
    { label: '三振', isRed: false },
    { label: '右安', isRed: true },
    { label: '二ゴ', isRed: false },
    { label: '本塁打', isRed: true },
  ];
  while (tiles.length < 4) {
    tiles.push(defaultSampleTiles[tiles.length]);
  }

  const tilesHtml = tiles
    .slice(0, 4)
    .map((t) => `<div class="tv-pa-tile ${t.isRed ? 'red' : 'blue'}">${t.label}</div>`)
    .join('');

  // 4. 左下：ミニ球場カード（守備シフト5種表示）
  const shiftText = DEFENSE_SHIFT_LABELS[m.defenseShift] || '通常シフト';
  const hasAnyRunner = Boolean(m.bases.b1 || m.bases.b2 || m.bases.b3);
  const canSteal = Boolean((m.bases.b1 && !m.bases.b2) || (m.bases.b2 && !m.bases.b3));
  const canSqueeze = Boolean(m.bases.b3 && m.outs < 2);

  // 5. 作戦ドロワー（[ 🔘 作戦 ] クリックでポップアップ展開）
  const tacticsDrawerHtml = isTacticsDrawerOpen
    ? `
    <div class="tactics-modal-overlay" data-act="close-tactics-bg">
      <div class="tactics-drawer-card">
        <div class="drawer-head">
          <h3>${isPlayerBatting ? '⚔️ 攻撃作戦サイン指示' : '🛡️ 守備戦術・配球指示'}</h3>
          <button class="x" data-act="toggle-tactics-drawer">✕</button>
        </div>
        <div class="drawer-body">
          ${
            isPlayerBatting
              ? `
            <div class="t-section">
              <h4>打撃アプローチ（現在: ${OFFENSE_TACTIC_LABELS[m.offenseTactic]}）</h4>
              <div class="t-grid">
                <button class="btn-tac ${m.offenseTactic === 'NORMAL' ? 'on' : ''}" data-act="set-tactic" data-val="NORMAL">⚾ 通常打撃<small>サインなし自由打撃</small></button>
                <button class="btn-tac ${m.offenseTactic === 'AGGRESSIVE' ? 'on' : ''}" data-act="set-tactic" data-val="AGGRESSIVE">⚡ 積極打法<small>初球強打</small></button>
                <button class="btn-tac ${m.offenseTactic === 'OPPOSITE' ? 'on' : ''}" data-act="set-tactic" data-val="OPPOSITE">➡️ 逆方向意識<small>流し打ち進塁打</small></button>
                <button class="btn-tac ${m.offenseTactic === 'LOW_BALL' ? 'on' : ''}" data-act="set-tactic" data-val="LOW_BALL">⬇️ 低め見逃せ<small>球数消費</small></button>
                <button class="btn-tac ${m.offenseTactic === 'POWER' ? 'on' : ''}" data-act="set-tactic" data-val="POWER">💥 強振<small>長打・本塁打狙い</small></button>
                <button class="btn-tac ${m.offenseTactic === 'CONTACT' ? 'on' : ''}" data-act="set-tactic" data-val="CONTACT">🎯 ミート重視<small>三振激減・単打狙い</small></button>
                <button class="btn-tac ${m.offenseTactic === 'PATIENCE' ? 'on' : ''}" data-act="set-tactic" data-val="PATIENCE">✋ 待球（待て）<small>見送り四球狙い</small></button>
              </div>
            </div>
            <div class="t-section">
              <h4>小技・機動・奇襲</h4>
              <div class="t-grid">
                <button class="btn-tac ${m.offenseTactic === 'BUNT' ? 'on' : ''}" data-act="set-tactic" data-val="BUNT" ${!hasAnyRunner || m.outs >= 2 ? 'disabled' : ''}>⚾ 送りバント<small>${!hasAnyRunner ? '走者なし不可' : m.outs >= 2 ? '2死時は不可' : '確実な進塁'}</small></button>
                <button class="btn-tac ${m.offenseTactic === 'SQUEEZE' ? 'on' : ''}" data-act="set-tactic" data-val="SQUEEZE" ${!canSqueeze ? 'disabled' : ''}>🚨 スクイズ<small>${!canSqueeze ? '無死/1死三塁時のみ' : '本塁生還1点狙い'}</small></button>
                <button class="btn-tac ${m.offenseTactic === 'STEAL' ? 'on' : ''}" data-act="set-tactic" data-val="STEAL" ${!canSteal ? 'disabled' : ''}>⚡ 盗塁<small>${!canSteal ? '盗塁可能走者なし' : '単独スチール'}</small></button>
              </div>
            </div>`
              : `
            <div class="t-section">
              <h4>守備陣形シフト（全5種）</h4>
              <div class="t-grid">
                <button class="btn-tac ${m.defenseShift === 'NORMAL' ? 'on' : ''}" data-act="set-shift" data-val="NORMAL">定位置<small>通常バランス</small></button>
                <button class="btn-tac ${m.defenseShift === 'FORWARD' ? 'on' : ''}" data-act="set-shift" data-val="FORWARD">前進守備<small>本塁生還阻止</small></button>
                <button class="btn-tac ${m.defenseShift === 'DOUBLE_PLAY' ? 'on' : ''}" data-act="set-shift" data-val="DOUBLE_PLAY">併殺シフト<small>二遊間ゲッツー</small></button>
                <button class="btn-tac ${m.defenseShift === 'DEEP_OUTFIELD' ? 'on' : ''}" data-act="set-shift" data-val="DEEP_OUTFIELD">長打警戒<small>外野深め後退</small></button>
                <button class="btn-tac ${m.defenseShift === 'BUNT_DEFENSE' ? 'on' : ''}" data-act="set-shift" data-val="BUNT_DEFENSE">バント警戒<small>一・三塁猛前進</small></button>
              </div>
            </div>
            <div class="t-section">
              <h4>バッテリー戦術</h4>
              <div class="t-grid">
                <button class="btn-tac ${m.defenseAlert ? 'on alert' : ''}" data-act="toggle-caution">🚨 走者警戒<small>${m.defenseAlert ? '現在ON (クリック解除)' : 'クイック・盗塁阻止'}</small></button>
                <button class="btn-tac" data-act="intentional-walk">✋ 申告敬遠<small>満塁策・勝負回避</small></button>
                <button class="btn-tac" data-act="send-msg" ${pitchingTeam.messagesLeft <= 0 ? 'disabled' : ''}>📣 伝令を送る<small>マウンド集結 (残${pitchingTeam.messagesLeft}回)</small></button>
              </div>
            </div>`
          }
          <div class="t-section" style="margin-top:10px">
            <h4>ゲーム進行設定</h4>
            <div style="display:flex;gap:8px;align-items:center">
              <div class="tv-speed-pills">
                <button class="sp-btn ${m.speed === 1.0 ? 'on' : ''}" data-act="set-speed" data-val="1.0">1.0x</button>
                <button class="sp-btn ${m.speed === 1.5 ? 'on' : ''}" data-act="set-speed" data-val="1.5">1.5x</button>
                <button class="sp-btn ${m.speed === 2.0 ? 'on' : ''}" data-act="set-speed" data-val="2.0">2.0x</button>
              </div>
              <button class="tv-action-pill ${autoPlayTimer !== null ? 'active' : ''}" data-act="toggle-autoplay">
                ${autoPlayTimer !== null ? '⏸️ 一時停止' : '⏩ 自動進行'}
              </button>
            </div>
          </div>
          <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between">
            <button class="btn primary" data-act="open-sub-modal">👥 選手交代・直接対比画面へ</button>
            <button class="btn" data-act="toggle-tactics-drawer">閉じる</button>
          </div>
        </div>
      </div>
    </div>`
    : '';

  // 6. トラッキングHUDオーバーレイ (infield_ground_wide.jpg の TRK-STATS)
  const trackingOverlayHtml = `
    <div class="trk-stats-card ${isTrackingVisible ? 'visible' : ''}">
      <div class="trk-title">TRK-STATS</div>
      <div class="trk-sec">
        <div class="trk-lbl">PITCH (投球)</div>
        <div class="trk-line"><span class="k">P-TYPE :</span> <span class="v">${trackingData.pitchType}</span></div>
        <div class="trk-line"><span class="k">AVG-P :</span> <span class="v">${trackingData.avgPitch}</span></div>
      </div>
      <div class="trk-sec">
        <div class="trk-lbl">HIT (打球)</div>
        <div class="trk-line"><span class="k">EXIT-V :</span> <span class="v">${trackingData.exitVelocity}</span></div>
        <div class="trk-line"><span class="k">ANGLE :</span> <span class="v">${trackingData.launchAngle}</span></div>
      </div>
    </div>`;

  // 7. ドラマチックプレーバナー (infield_ground_closeup.jpg)
  const dramaticBannerHtml = `
    <div class="dramatic-play-banner ${isDramaticBannerVisible ? 'visible' : ''}">
      <div class="dp-inner">
        <div class="dp-text">DRAMATIC PLAY!</div>
        <div class="dp-sub">${dramaticBannerText}</div>
      </div>
    </div>`;

  return `
  <div class="koshien-match-screen">
    <!-- 3D Stadium Canvas Host (画面クリックまたはSpaceで投球) -->
    <div id="match-canvas-host" class="match-canvas-host" data-act="step-pitch"></div>

    <!-- 1. Top Scoreboard (koshien_pitch_complete.jpg の完全再現) -->
    <header class="tv-scoreboard">
      <div class="sb-inning">
        <span class="ord">${m.inning}回</span>
        <div class="sb-inning-divider"></div>
        <span class="lbl half-badge ${m.isBottom ? 'bottom' : 'top'}">${m.isBottom ? '▼ 裏' : '▲ 表'}</span>
      </div>

      <div class="sb-team visitor ${!m.isBottom ? 'attacking' : ''}">
        <div class="sb-kanji red">${esc(kanjiA)}</div>
        <div class="sb-score">${m.scoreA}</div>
      </div>

      <div class="sb-center-diamond">
        <div class="quad tl"></div><div class="quad tr"></div>
        <div class="quad bl"></div><div class="quad br"></div>
      </div>

      <div class="sb-team home ${m.isBottom ? 'attacking' : ''}">
        <div class="sb-kanji blue">${esc(kanjiB)}</div>
        <div class="sb-score">${m.scoreB}</div>
      </div>

      ${bsoAndRunnersHtml}
    </header>

    <!-- 2. Left Pitcher Card (ERA, Pitches, STAMINAバー) -->
    <aside class="tv-pitcher-card">
      <div class="tv-avatar-frame">${renderAvatarSvg(pitcher.faceSeed, pitchingTeam.capColor, 62, { isHelmet: false, insignia: m.isBottom ? kanjiA : kanjiB, darkBg: true })}</div>
      <div class="tv-pitcher-stats">
        <div class="row"><span class="k">ERA</span><b class="v">${eraFormatted}</b></div>
        <div class="row"><span class="k">Pitches</span><b class="v">${pitcherState.pitches}</b></div>
      </div>
      <div class="tv-stamina-container">
        <span class="stamina-lbl">STAMINA</span>
        <div class="stamina-track">
          <div class="stamina-gradient-fill"></div>
          <div class="stamina-mask" style="width:${(1 - stamRatio) * 100}%"></div>
        </div>
      </div>
    </aside>

    <!-- 3. Bottom-Left Mini Field Diamond Card (守備シフト表示：上段1箇所のみ) -->
    <aside class="tv-field-card">
      <div class="tf-head">${shiftText}</div>
      <div class="tf-diamond-wrap">${renderMiniDiamondSvg(m.defenseShift, m.bases)}</div>
    </aside>

    <!-- 4. Right Batter Card (AVG, HR, 4つの結果タイル) -->
    <aside class="tv-batter-card">
      <div class="tv-avatar-frame">${renderAvatarSvg(batter.faceSeed, battingTeam.capColor, 62, { isHelmet: true, insignia: m.isBottom ? kanjiB : kanjiA, darkBg: true })}</div>
      <div class="tv-batter-stats">
        <div class="row"><span class="k">AVG</span><b class="v">${avgFormatted}</b></div>
        <div class="row"><span class="k">HR</span><b class="v">${hrFormatted}</b></div>
      </div>
      <div class="tv-pa-tiles-row">${tilesHtml}</div>
    </aside>

    <!-- 4.5. テレビ中継演出：コールアウトバナー ＆ スピードガンHUD -->
    <div id="tv-call-banner" class="tv-call-banner hidden"></div>
    ${
      currentRadarPitch
        ? `<div id="tv-speed-gun" class="tv-speed-gun visible">
             <div class="sg-label">RADAR PITCH</div>
             <div class="sg-val">${currentRadarPitch.speed}<span class="sg-unit">km/h</span></div>
             <div class="sg-type">${currentRadarPitch.pitchName}</div>
           </div>`
        : `<div id="tv-speed-gun" class="tv-speed-gun hidden"></div>`
    }

    <!-- 5. トラッキングHUD ＆ ドラマチック演出 -->
    ${trackingOverlayHtml}
    ${dramaticBannerHtml}

    <!-- 6. Bottom Right: PlayStation-Style [ ⭕ 作戦 ] 単一カプセルボタン ＆ 音声切替 -->
    <div class="tv-bottom-right-wrap">
      ${
        isPlayerBatting && m.offenseTactic !== 'NORMAL'
          ? `<div class="tv-active-sign-pill">指示中: ${OFFENSE_TACTIC_LABELS[m.offenseTactic]}</div>`
          : !isPlayerBatting && m.defenseAlert
            ? `<div class="tv-active-sign-pill alert">🚨 走者警戒中</div>`
            : autoPlayTimer !== null
              ? `<div class="tv-active-sign-pill auto">⏩ 自動進行 (${m.speed}x)</div>`
              : ''
      }
      <div class="tv-actions-row">
        <button class="tv-sound-btn" data-act="toggle-sound" title="${sfx.getMuted() ? '音声をオンにする' : '音声をミュートする'}">
          ${sfx.getMuted() ? '🔇' : '🔊'}
        </button>
        <button class="tv-tactics-btn" data-act="toggle-tactics-drawer">
          <svg width="22" height="22" viewBox="0 0 24 24" style="flex-shrink:0">
            <circle cx="12" cy="12" r="10.5" fill="#1e293b" stroke="#64748b" stroke-width="1.2"/>
            <circle cx="12" cy="12" r="6.2" fill="none" stroke="#ef4444" stroke-width="2.2"/>
          </svg>
          <span class="btn-text">作戦</span>
        </button>
      </div>
    </div>

    <!-- 6. 右上：開発用トグルボタン（普段はすっきり・クリックでモーダル展開） -->
    <button class="tv-dev-trigger-btn" data-act="toggle-form-editor">
      🛠️ 開発用
    </button>

    <!-- 7. 開発用ポップアップモーダル（開閉式・タブ構造） -->
    <div id="plan-b-form-panel" class="dev-modal-overlay" style="display:${isFormEditorOpen ? 'flex' : 'none'};">
      <div class="dev-modal-card">
        <div class="dev-modal-header">
          <b style="font-size:13px;display:flex;align-items:center;gap:6px">
            🛠️ 開発用コントロール ＆ バランス検証
          </b>
          <button class="dev-modal-close-btn" data-act="toggle-form-editor">✕ 閉じる</button>
        </div>

        <!-- タブ切り替えバー -->
        <div style="display:grid;grid-template-columns:1.2fr 1.1fr 1.1fr 1fr;gap:4px;background:rgba(30,41,59,0.8);padding:3px;border-radius:6px;border:1px solid #334155">
          <button data-act="set-dev-tab" data-tab="SIMULATION" style="padding:6px 2px;font-size:10.5px;font-weight:800;border-radius:4px;border:1px solid ${devModalActiveTab === 'SIMULATION' ? '#38bdf8' : 'transparent'};background:${devModalActiveTab === 'SIMULATION' ? '#0369a1' : 'transparent'};color:${devModalActiveTab === 'SIMULATION' ? '#fff' : '#94a3b8'};cursor:pointer">
            ⚾ 投手検証
          </button>
          <button data-act="set-dev-tab" data-tab="FORM_EDITOR" style="padding:6px 2px;font-size:10.5px;font-weight:800;border-radius:4px;border:1px solid ${devModalActiveTab === 'FORM_EDITOR' ? '#38bdf8' : 'transparent'};background:${devModalActiveTab === 'FORM_EDITOR' ? '#0369a1' : 'transparent'};color:${devModalActiveTab === 'FORM_EDITOR' ? '#fff' : '#94a3b8'};cursor:pointer">
            🕺 投手フォーム
          </button>
          <button data-act="set-dev-tab" data-tab="BATTER_EDITOR" style="padding:6px 2px;font-size:10.5px;font-weight:800;border-radius:4px;border:1px solid ${devModalActiveTab === 'BATTER_EDITOR' ? '#38bdf8' : 'transparent'};background:${devModalActiveTab === 'BATTER_EDITOR' ? '#0369a1' : 'transparent'};color:${devModalActiveTab === 'BATTER_EDITOR' ? '#fff' : '#94a3b8'};cursor:pointer">
            💥 打者デモ
          </button>
          <button data-act="set-dev-tab" data-tab="EFFECTS_TEST" style="padding:6px 2px;font-size:10.5px;font-weight:800;border-radius:4px;border:1px solid ${devModalActiveTab === 'EFFECTS_TEST' ? '#38bdf8' : 'transparent'};background:${devModalActiveTab === 'EFFECTS_TEST' ? '#0369a1' : 'transparent'};color:${devModalActiveTab === 'EFFECTS_TEST' ? '#fff' : '#94a3b8'};cursor:pointer">
            ✨ 演出テスト
          </button>
        </div>

        <!-- 投球モーション緩急（生体力学リアル化）切替トグル（安全弁） -->
        <div style="background:${isRealisticPitchEasingActive ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)'};border:1.5px solid ${isRealisticPitchEasingActive ? '#10b981' : '#64748b'};padding:6px 10px;border-radius:6px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;flex-direction:column">
            <span style="font-size:10.5px;font-weight:800;color:${isRealisticPitchEasingActive ? '#6ee7b7' : '#cbd5e1'}">
              🎬 投球緩急: ${isRealisticPitchEasingActive ? '生体力学リアル緩急 (タメ・加速)' : '従来の等速直線 (旧仕様)'}
            </span>
            <span style="font-size:8.5px;color:#94a3b8">
              ${isRealisticPitchEasingActive ? '足上げ静止タメ ➜ 重力加速 ➜ 腕のしなり ➜ 爆発的リリース急加速' : '滑らかな等速補間。NG時はいつでもこのボタンで復元できます'}
            </span>
          </div>
          <button data-act="toggle-pitch-easing" style="padding:4px 9px;border-radius:5px;font-size:10px;font-weight:800;border:1px solid ${isRealisticPitchEasingActive ? '#10b981' : '#94a3b8'};background:${isRealisticPitchEasingActive ? '#059669' : '#334155'};color:#fff;cursor:pointer;white-space:nowrap">
            ${isRealisticPitchEasingActive ? '✓ リアル有効中 (旧仕様に戻す)' : '🔄 旧仕様有効中 (リアルに切替)'}
          </button>
        </div>

        ${devModalActiveTab === 'SIMULATION' ? `
          <!-- チート機能インジケーター -->
          <div style="background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.4);padding:4px 8px;border-radius:5px;font-size:9.5px;color:#fef08a;font-weight:700;display:flex;align-items:center;gap:4px">
            ⚡ 投球画面のマウンド登板中投手にも即時反映中（開発チート機能）
          </div>

          <!-- 1. 最高球速バッジ ＆ 相手打線情報 -->
          <div style="background:linear-gradient(135deg, #1e3a8a, #0f172a);border:1.5px solid #38bdf8;padding:8px 12px;border-radius:8px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:9.5px;color:#93c5fd;font-weight:700">最高球速 (肩の強さ × 投球フォーム)</div>
              <div style="font-size:22px;font-weight:900;color:#fef08a;line-height:1.2">
                ${Math.round(pitchVelocity(devPitcherParams.arm, devPitcherParams.form))} <span style="font-size:12px;color:#cbd5e1">km/h</span>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9.5px;color:#94a3b8">対戦相手 (9イニング・27アウト)</div>
              <div style="font-size:12px;font-weight:800;color:#38bdf8">平均高校（ALL 50 / C相当）</div>
            </div>
          </div>

          <!-- 2. ワンクリック・プリセット -->
          <div>
            <div style="font-size:10px;color:#cbd5e1;font-weight:700;margin-bottom:3px">ワンクリック・プリセット:</div>
            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:3px">
              <button data-act="apply-pitcher-preset" data-preset="BALANCED" style="padding:5px 2px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer">標準 (125k)</button>
              <button data-act="apply-pitcher-preset" data-preset="ACE" style="padding:5px 2px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#7dd3fc;cursor:pointer">エース (150k)</button>
              <button data-act="apply-pitcher-preset" data-preset="WILD" style="padding:5px 2px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid #ef4444;background:#450a0a;color:#fca5a5;cursor:pointer">豪腕 (160k/荒)</button>
              <button data-act="apply-pitcher-preset" data-preset="CRAFTY" style="padding:5px 2px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid #10b981;background:#064e3b;color:#a7f3d0;cursor:pointer">技巧派 (119k/針)</button>
            </div>
          </div>

          <!-- 3. 能力スライダー群（0〜100、ランク表示） -->
          <div style="background:rgba(30,41,59,0.85);padding:6px 10px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:3px">
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>肩の強さ (球速原資):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.arm}" data-act="pitcher-param-slider" data-param="arm" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.arm} (${abilityRank(devPitcherParams.arm).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>投球フォーム (力伝達):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.form}" data-act="pitcher-param-slider" data-param="form" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.form} (${abilityRank(devPitcherParams.form).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>コントロール (制球):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.control}" data-act="pitcher-param-slider" data-param="control" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.control} (${abilityRank(devPitcherParams.control).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>変化球キレ (空振率):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.breaking}" data-act="pitcher-param-slider" data-param="breaking" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.breaking} (${abilityRank(devPitcherParams.breaking).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>スタミナ (バテ耐性):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.stamina}" data-act="pitcher-param-slider" data-param="stamina" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.stamina} (${abilityRank(devPitcherParams.stamina).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>度胸 (ピンチ耐性):</span>
              <input type="range" min="0" max="100" value="${devPitcherParams.guts}" data-act="pitcher-param-slider" data-param="guts" style="accent-color:#38bdf8;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:#fbbf24">${devPitcherParams.guts} (${abilityRank(devPitcherParams.guts).rank})</span>
            </div>
            <div style="display:grid;grid-template-columns:110px 1fr 50px;align-items:center;gap:6px;font-size:10px">
              <span>調子 (-5〜+5):</span>
              <input type="range" min="-5" max="5" value="${devPitcherParams.condition}" data-act="pitcher-param-slider" data-param="condition" style="accent-color:#ec4899;cursor:pointer" />
              <span style="text-align:right;font-weight:800;color:${devPitcherParams.condition > 0 ? '#f43f5e' : devPitcherParams.condition < 0 ? '#38bdf8' : '#e2e8f0'}">
                ${devPitcherParams.condition > 0 ? `+${devPitcherParams.condition}` : devPitcherParams.condition}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;font-size:10px">
              <span>利き腕:</span>
              <button data-act="toggle-dev-pitcher-throws" style="padding:2px 10px;border-radius:4px;border:1px solid #f59e0b;background:#78350f;color:#fde68a;font-weight:800;cursor:pointer">
                ${devPitcherParams.throws === 'R' ? '右投げ (R)' : '左投げ (L)'}
              </button>
            </div>
          </div>

          <!-- 4. シミュレーションボタン -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button data-act="run-9inn-simulation" style="background:linear-gradient(135deg, #0284c7, #0369a1);border:1px solid #38bdf8;color:#fff;padding:8px 4px;border-radius:6px;font-weight:900;font-size:11.5px;cursor:pointer;box-shadow:0 2px 8px rgba(2,132,199,0.3)">
              ▶ 9回シミュレート (1試合)
            </button>
            <button data-act="run-10match-simulation" style="background:linear-gradient(135deg, #059669, #047857);border:1px solid #34d399;color:#fff;padding:8px 4px;border-radius:6px;font-weight:900;font-size:11.5px;cursor:pointer;box-shadow:0 2px 8px rgba(5,150,105,0.3)">
              🔁 10試合平均で検証 (9回)
            </button>
          </div>

          <!-- 5. シミュレーション結果カード -->
          ${devSimResult ? `
          <div style="background:rgba(15,23,42,0.95);border:1.5px solid #eab308;border-radius:8px;padding:8px 10px;box-shadow:0 0 16px rgba(234,179,8,0.25)">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:4px;margin-bottom:6px">
              <span style="font-weight:900;color:#fef08a;font-size:11.5px">
                📊 ${devSimResult.innings}回（${devSimResult.innings * 3}アウト）結果 [ ${devSimResult.matches === 1 ? '1試合' : `${devSimResult.matches}試合の平均`} ]
              </span>
              <span style="font-size:10.5px;color:#94a3b8">最高: ${devSimResult.maxSpeedKmh}km/h</span>
            </div>
            <!-- 上段：投球テンポ・制球率・被打率・失点 -->
            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:4px;text-align:center;margin-bottom:4px">
              <div style="background:#1e293b;padding:4px 2px;border-radius:4px">
                <div style="font-size:8.5px;color:#94a3b8">総投球数</div>
                <div style="font-size:13px;font-weight:900;color:#f8fafc">${devSimResult.pitches} <span style="font-size:8.5px;color:#94a3b8">(${devSimResult.pitchesPerInning}/回)</span></div>
              </div>
              <div style="background:#1e293b;padding:4px 2px;border-radius:4px">
                <div style="font-size:8.5px;color:#94a3b8">ストライク率</div>
                <div style="font-size:13px;font-weight:900;color:#38bdf8">${devSimResult.strikeRate}%</div>
              </div>
              <div style="background:#1e293b;padding:4px 2px;border-radius:4px">
                <div style="font-size:8.5px;color:#94a3b8">被安打 (単/二/三/本)</div>
                <div style="font-size:12px;font-weight:900;color:#facc15">
                  ${devSimResult.hits}本 <span style="font-size:8.5px;color:#94a3b8">(${devSimResult.singles}/${devSimResult.doubles}/${devSimResult.triples}/${devSimResult.homeRuns})</span>
                </div>
              </div>
              <div style="background:#1e293b;padding:4px 2px;border-radius:4px">
                <div style="font-size:8.5px;color:#94a3b8">失点 (防御率)</div>
                <div style="font-size:13px;font-weight:900;color:#ef4444">${devSimResult.runs}点 <span style="font-size:8.5px;color:#fca5a5">(ERA ${devSimResult.era})</span></div>
              </div>
            </div>
            <!-- 下段：奪三振（K9）・与四球・与死球 -->
            <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:4px;text-align:center">
              <div style="background:#0f3a2c;border:1px solid #059669;padding:5px 4px;border-radius:4px">
                <div style="font-size:9px;color:#6ee7b7;font-weight:700">奪三振 (K / 奪三振率)</div>
                <div style="font-size:14px;font-weight:900;color:#34d399">
                  ${devSimResult.strikeouts}個 <span style="font-size:10px;color:#a7f3d0">(K/9: ${devSimResult.k9})</span>
                </div>
              </div>
              <div style="background:#281b3d;border:1px solid #7c3aed;padding:5px 4px;border-radius:4px">
                <div style="font-size:9px;color:#c4b5fd;font-weight:700">与四球 (BB)</div>
                <div style="font-size:14px;font-weight:900;color:#c084fc">${devSimResult.walks}個</div>
              </div>
              <div style="background:#3b131e;border:1px solid #e11d48;padding:5px 4px;border-radius:4px">
                <div style="font-size:9px;color:#fda4af;font-weight:700">与死球 (HBP)</div>
                <div style="font-size:14px;font-weight:900;color:#fb7185">${devSimResult.deadBalls}個</div>
              </div>
            </div>
          </div>
          ` : `
          <div style="background:rgba(15,23,42,0.6);border:1px dashed #475569;border-radius:8px;padding:12px;text-align:center;color:#94a3b8;font-size:10.5px">
            💡 上のボタンを押すと、画面描画を省いて9回（27アウト）の投球を高速計算し、奪三振・四死球・被安打・失点等の結果を表示します。
          </div>
          `}
        ` : devModalActiveTab === 'FORM_EDITOR' ? `
          <!-- 【タブ2】投球フォームエディタ -->
          <!-- ① フォーム種別切替（実写連続写真4種＋高低2種完全準拠） -->
          <div>
            <div style="color:#cbd5e1;font-weight:700;margin-bottom:3px">① 投球フォーム切替 (連続写真トレース):</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
              <button class="pb-form-btn" data-act="pb-set-form" data-form="OVERHAND_HIGH" style="padding:4px 5px;border-radius:5px;border:1px solid ${demoForm === 'OVERHAND_HIGH' ? '#f59e0b' : '#475569'};background:${demoForm === 'OVERHAND_HIGH' ? '#1e40af' : '#1e293b'};color:#fff;cursor:pointer;font-size:10.5px;font-weight:700">オーバースロー(高・今井)</button>
              <button class="pb-form-btn" data-act="pb-set-form" data-form="OVERHAND_LOW" style="padding:4px 5px;border-radius:5px;border:1px solid ${demoForm === 'OVERHAND_LOW' ? '#f59e0b' : '#475569'};background:${demoForm === 'OVERHAND_LOW' ? '#1e40af' : '#1e293b'};color:#fff;cursor:pointer;font-size:10.5px;font-weight:700">オーバースロー(低・すり足)</button>
              <button class="pb-form-btn" data-act="pb-set-form" data-form="THREE_QUARTERS" style="padding:4px 5px;border-radius:5px;border:1px solid ${demoForm === 'THREE_QUARTERS' ? '#f59e0b' : '#475569'};background:${demoForm === 'THREE_QUARTERS' ? '#1e40af' : '#1e293b'};color:#fff;cursor:pointer;font-size:10.5px;font-weight:700">スリークォーター(大勢型)</button>
              <button class="pb-form-btn" data-act="pb-set-form" data-form="SIDEARM" style="padding:4px 5px;border-radius:5px;border:1px solid ${demoForm === 'SIDEARM' ? '#f59e0b' : '#475569'};background:${demoForm === 'SIDEARM' ? '#1e40af' : '#1e293b'};color:#fff;cursor:pointer;font-size:10.5px;font-weight:700">サイドスロー(高校#1型)</button>
              <button class="pb-form-btn" data-act="pb-set-form" data-form="SUBMARINE" style="grid-column:span 2;padding:4px 5px;border-radius:5px;border:1px solid ${demoForm === 'SUBMARINE' ? '#f59e0b' : '#475569'};background:${demoForm === 'SUBMARINE' ? '#1e40af' : '#1e293b'};color:#fff;cursor:pointer;font-size:10.5px;font-weight:700">アンダースロー (背面腕天突き➜超低空すくい投げ)</button>
            </div>
          </div>

          <!-- ② カメラ視点 ＆ 利き腕切替 -->
          <div style="display:flex;gap:4px;align-items:center;justify-content:space-between">
            <div style="display:flex;gap:3px;flex:1">
              <button class="pb-cam-btn" data-act="pb-set-cam" data-cam="PITCH_VIEW" style="flex:1;padding:4px 3px;border-radius:5px;border:1px solid ${demoCameraMode === 'PITCH_VIEW' ? '#38bdf8' : '#475569'};background:${demoCameraMode === 'PITCH_VIEW' ? '#0369a1' : '#1e293b'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">📹 センター背面</button>
              <button class="pb-cam-btn" data-act="pb-set-cam" data-cam="SIDE_3B_VIEW" style="flex:1;padding:4px 3px;border-radius:5px;border:1px solid ${demoCameraMode === 'SIDE_3B_VIEW' ? '#38bdf8' : '#475569'};background:${demoCameraMode === 'SIDE_3B_VIEW' ? '#0369a1' : '#1e293b'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">📐 三塁側(真横)</button>
              <button class="pb-cam-btn" data-act="pb-set-cam" data-cam="FRONT_SUB_VIEW" style="flex:1;padding:4px 3px;border-radius:5px;border:1px solid ${demoCameraMode === 'FRONT_SUB_VIEW' ? '#38bdf8' : '#475569'};background:${demoCameraMode === 'FRONT_SUB_VIEW' ? '#0369a1' : '#1e293b'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">🎥 本塁斜め前</button>
            </div>
            <button id="pb-throws-btn" data-act="pb-toggle-throws" style="padding:4px 6px;border-radius:5px;border:1px solid #f59e0b;background:#78350f;color:#fde68a;cursor:pointer;font-size:10px;font-weight:800">${demoThrows === 'R' ? '右投 (右足軸)' : '左投 (左足軸)'}</button>
          </div>

          <!-- ③ 連続15コマ シークバー ＆ コマ送りボタン -->
          <div style="background:rgba(30,41,59,0.85);padding:5px 7px;border-radius:6px;border:1px solid #334155">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <span style="color:#93c5fd;font-weight:700">③ 連続フォーム確認 (0%〜100%):</span>
              <span id="pb-phase-label" style="color:#fbbf24;font-weight:800;font-size:10px">① セット構え (0%)</span>
            </div>
            <input id="pb-phase-slider" type="range" min="0" max="100" value="${Math.round(demoPhase * 100)}" style="width:100%;accent-color:#3b82f6;cursor:pointer" />
            <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-top:3px">
              <button data-act="pb-step-phase" data-phase="0.00" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">①構え</button>
              <button data-act="pb-step-phase" data-phase="0.08" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">②重心</button>
              <button data-act="pb-step-phase" data-phase="0.16" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">③足始</button>
              <button data-act="pb-step-phase" data-phase="0.24" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">④足頂</button>
              <button data-act="pb-step-phase" data-phase="0.32" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#7dd3fc;cursor:pointer;font-weight:700" title="軸足プレート固定・ヒップファースト並進">⑤並初</button>
              <button data-act="pb-step-phase" data-phase="0.38" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#7dd3fc;cursor:pointer;font-weight:700" title="軸足プレート固定・並進沈み込み">⑥並沈</button>
              <button data-act="pb-step-phase" data-phase="0.45" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#7dd3fc;cursor:pointer;font-weight:700" title="軸足プレート固定・腕の割れ">⑦割れ</button>
              <button data-act="pb-step-phase" data-phase="0.52" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑧着地</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-top:2.5px">
              <button data-act="pb-step-phase" data-phase="0.58" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑨トップ</button>
              <button data-act="pb-step-phase" data-phase="0.63" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑩外旋</button>
              <button data-act="pb-step-phase" data-phase="0.68" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #f59e0b;background:#78350f;color:#fef08a;cursor:pointer;font-weight:800">⑪放球</button>
              <button data-act="pb-step-phase" data-phase="0.74" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑫減速</button>
              <button data-act="pb-step-phase" data-phase="0.80" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑬巻込</button>
              <button data-act="pb-step-phase" data-phase="0.88" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑭フォロー</button>
              <button data-act="pb-step-phase" data-phase="1.00" style="padding:2.5px 1px;font-size:8.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑮守備</button>
            </div>
            <div style="display:flex;gap:4px;margin-top:4px">
              <button data-act="pb-play-motion" data-speed="0.35" style="flex:1;padding:4px 5px;border-radius:5px;border:1px solid #38bdf8;background:#0284c7;color:#fff;cursor:pointer;font-weight:800;font-size:10px">▶ スロー連続再生 (0.35x)</button>
              <button data-act="pb-play-motion" data-speed="1.0" style="flex:1;padding:4px 5px;border-radius:5px;border:1px solid #10b981;background:#059669;color:#fff;cursor:pointer;font-weight:800;font-size:10px">⚾ 通常投球再生 (1.0x)</button>
            </div>
          </div>

          <!-- ④ 3Dボーン フォームエディタ（フレーム別微調整スライダー） -->
          <div style="background:rgba(30,41,59,0.85);padding:5px 7px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:3px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="color:#a7f3d0;font-weight:700">④ 3Dボーン フォームエディタ (リアルタイム変形):</span>
              <button data-act="pb-reset-mods" style="padding:1px 6px;font-size:9.5px;border-radius:4px;border:1px solid #64748b;background:#334155;color:#f8fafc;cursor:pointer">リセット</button>
            </div>
            <div style="display:grid;grid-template-columns:104px 1fr 36px;align-items:center;gap:4px;font-size:10px">
              <span>足上げ高さ (②):</span>
              <input id="pb-mod-leg" type="range" min="20" max="150" value="${Math.round(demoModifiers.legLiftHeight * 100)}" style="accent-color:#10b981;cursor:pointer" />
              <span id="pb-mod-leg-val" style="text-align:right;color:#fbbf24">${Math.round(demoModifiers.legLiftHeight * 100)}%</span>
            </div>
            <div style="display:grid;grid-template-columns:104px 1fr 36px;align-items:center;gap:4px;font-size:10px">
              <span>軸足沈み込み (③):</span>
              <input id="pb-mod-sink" type="range" min="50" max="150" value="${Math.round(demoModifiers.pelvisSinkDepth * 100)}" style="accent-color:#10b981;cursor:pointer" />
              <span id="pb-mod-sink-val" style="text-align:right;color:#fbbf24">${Math.round(demoModifiers.pelvisSinkDepth * 100)}%</span>
            </div>
            <div style="display:grid;grid-template-columns:104px 1fr 36px;align-items:center;gap:4px;font-size:10px">
              <span>腕の角度補正 (⑧):</span>
              <input id="pb-mod-arm" type="range" min="-35" max="35" value="${Math.round(demoModifiers.armSlotOffsetDeg)}" style="accent-color:#10b981;cursor:pointer" />
              <span id="pb-mod-arm-val" style="text-align:right;color:#fbbf24">${demoModifiers.armSlotOffsetDeg >= 0 ? '+' : ''}${Math.round(demoModifiers.armSlotOffsetDeg)}°</span>
            </div>
            <div style="display:grid;grid-template-columns:104px 1fr 36px;align-items:center;gap:4px;font-size:10px">
              <span>体幹傾き補正:</span>
              <input id="pb-mod-tilt" type="range" min="-25" max="25" value="${Math.round(demoModifiers.torsoTiltOffsetDeg)}" style="accent-color:#10b981;cursor:pointer" />
              <span id="pb-mod-tilt-val" style="text-align:right;color:#fbbf24">${demoModifiers.torsoTiltOffsetDeg >= 0 ? '+' : ''}${Math.round(demoModifiers.torsoTiltOffsetDeg)}°</span>
            </div>
          </div>

          <!-- ⑤ ユニフォーム ＆ 背番号 リアルタイム反映テスト -->
          <div style="background:rgba(30,41,59,0.85);padding:5px 7px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:4px">
            <div style="color:#f9a8d4;font-weight:700">⑤ ユニフォーム＆背番号 リアルタイム変更実証:</div>
            <div style="display:flex;gap:3px;align-items:center">
              <span style="font-size:10px;color:#cbd5e1;width:44px">背番号:</span>
              <button class="pb-num-btn" data-act="pb-set-jersey" data-num="1" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoJerseyNumber === 1 ? '#f59e0b' : '#475569'};background:${demoJerseyNumber === 1 ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:800">#1</button>
              <button class="pb-num-btn" data-act="pb-set-jersey" data-num="10" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoJerseyNumber === 10 ? '#f59e0b' : '#475569'};background:${demoJerseyNumber === 10 ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:800">#10</button>
              <button class="pb-num-btn" data-act="pb-set-jersey" data-num="11" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoJerseyNumber === 11 ? '#f59e0b' : '#475569'};background:${demoJerseyNumber === 11 ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:800">#11</button>
              <button class="pb-num-btn" data-act="pb-set-jersey" data-num="18" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoJerseyNumber === 18 ? '#f59e0b' : '#475569'};background:${demoJerseyNumber === 18 ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:800">#18</button>
            </div>
            <div style="display:flex;gap:3px;align-items:center">
              <span style="font-size:10px;color:#cbd5e1;width:44px">柄3種:</span>
              <button class="pb-pat-btn" data-act="pb-set-pattern" data-pat="NORMAL" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoUniformPattern === 'NORMAL' ? '#f59e0b' : '#475569'};background:${demoUniformPattern === 'NORMAL' ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px">無地</button>
              <button class="pb-pat-btn" data-act="pb-set-pattern" data-pat="PINSTRIPE" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoUniformPattern === 'PINSTRIPE' ? '#f59e0b' : '#475569'};background:${demoUniformPattern === 'PINSTRIPE' ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px">縦じま</button>
              <button class="pb-pat-btn" data-act="pb-set-pattern" data-pat="ACCENT_LINE" style="flex:1;padding:2px 4px;border-radius:4px;border:1px solid ${demoUniformPattern === 'ACCENT_LINE' ? '#f59e0b' : '#475569'};background:${demoUniformPattern === 'ACCENT_LINE' ? '#1e40af' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px">中央ライン</button>
            </div>
            <div style="display:flex;gap:3px;align-items:center">
              <span style="font-size:10px;color:#cbd5e1;width:44px">配色:</span>
              <button class="pb-col-btn" data-act="pb-set-color" data-col="SEIUN" style="flex:1;padding:2px 3px;border-radius:4px;border:1px solid ${demoColorPreset === 'SEIUN' ? '#f59e0b' : '#475569'};background:#1e3a8a;color:#fff;cursor:pointer;font-size:9.5px">白×濃紺</button>
              <button class="pb-col-btn" data-act="pb-set-color" data-col="CRIMSON" style="flex:1;padding:2px 3px;border-radius:4px;border:1px solid ${demoColorPreset === 'CRIMSON' ? '#f59e0b' : '#475569'};background:#881337;color:#fff;cursor:pointer;font-size:9.5px">生成×臙脂</button>
              <button class="pb-col-btn" data-act="pb-set-color" data-col="SKY" style="flex:1;padding:2px 3px;border-radius:4px;border:1px solid ${demoColorPreset === 'SKY' ? '#f59e0b' : '#475569'};background:#0284c7;color:#fff;cursor:pointer;font-size:9.5px">水色×紺</button>
              <button class="pb-col-btn" data-act="pb-set-color" data-col="GOLD" style="flex:1;padding:2px 3px;border-radius:4px;border:1px solid ${demoColorPreset === 'GOLD' ? '#f59e0b' : '#475569'};background:#111827;color:#fde047;cursor:pointer;font-size:9.5px">白×黒金</button>
            </div>
            <button id="pb-mask-btn" data-act="pb-toggle-mask" style="margin-top:2px;padding:4px 6px;border-radius:5px;border:1px solid ${demoColorMaskMode ? '#ec4899' : '#64748b'};background:${demoColorMaskMode ? '#831843' : '#0f172a'};color:#fdf2f8;cursor:pointer;font-size:10px;font-weight:800">
              🎨 部位別カラーIDマスク表示: ${demoColorMaskMode ? 'ON' : 'OFF'}
            </button>
          </div>
        ` : devModalActiveTab === 'BATTER_EDITOR' ? `
          <!-- 【タブ：BATTER_EDITOR】打者スイングアニメーション＆フォーム検証デモ -->
          <div style="background:rgba(30,41,59,0.85);padding:8px 10px;border-radius:6px;border:1.5px solid #38bdf8;box-shadow:0 0 12px rgba(56,189,248,0.25)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:11px;font-weight:900;color:#38bdf8">💥 バッター スイングアニメーション検証デモ</span>
              <span style="font-size:9px;background:#0369a1;color:#fff;padding:1px 6px;border-radius:4px;font-weight:700">96-Frame Rig</span>
            </div>

            <!-- 1. 打者専用カメラアングル切り替え -->
            <div style="background:rgba(15,23,42,0.6);border:1px solid #334155;border-radius:6px;padding:6px 8px;margin-bottom:6px">
              <div style="font-size:9.5px;color:#cbd5e1;font-weight:700;margin-bottom:4px">🎥 カメラ視点:</div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">
                <button data-act="bb-set-cam" data-cam="BATTER_FOCUS_VIEW" style="padding:4px 2px;font-size:9.5px;font-weight:800;border-radius:4px;border:1px solid #38bdf8;background:#0369a1;color:#fff;cursor:pointer" title="打者の表情・ヘルメット・前髪・バットを間近で観察">🔍 打者正面</button>
                <button data-act="bb-set-cam" data-cam="BATTER_SIDE_VIEW" style="padding:4px 2px;font-size:9.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#cbd5e1;cursor:pointer" title="バットのインサイドアウト軌道・インパクトを横から観察">📐 側面真横</button>
                <button data-act="bb-set-cam" data-cam="FRONT_SUB_VIEW" style="padding:4px 2px;font-size:9.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#cbd5e1;cursor:pointer" title="捕手・審判目線から観察">👀 捕手目線</button>
                <button data-act="bb-set-cam" data-cam="PITCH_VIEW" style="padding:4px 2px;font-size:9.5px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#cbd5e1;cursor:pointer" title="TV中継センター全体カメラ">🏟️ センター</button>
              </div>
            </div>

            <!-- 2. 左右打席切り替え -->
            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,0.6);border:1px solid #334155;border-radius:6px;padding:6px 8px;margin-bottom:6px">
              <span style="font-size:10px;font-weight:800;color:#cbd5e1">打席（利き腕）:</span>
              <div style="display:flex;gap:4px">
                <button data-act="bb-set-hands" data-hands="R" style="padding:3px 10px;font-size:10px;font-weight:800;border-radius:4px;border:1px solid ${batterDemoHandedness === 'R' ? '#f59e0b' : '#475569'};background:${batterDemoHandedness === 'R' ? '#78350f' : '#0f172a'};color:${batterDemoHandedness === 'R' ? '#fef08a' : '#cbd5e1'};cursor:pointer">
                  右打者 (RHB)
                </button>
                <button data-act="bb-set-hands" data-hands="L" style="padding:3px 10px;font-size:10px;font-weight:800;border-radius:4px;border:1px solid ${batterDemoHandedness === 'L' ? '#f59e0b' : '#475569'};background:${batterDemoHandedness === 'L' ? '#78350f' : '#0f172a'};color:${batterDemoHandedness === 'L' ? '#fef08a' : '#cbd5e1'};cursor:pointer">
                  左打者 (LHB)
                </button>
              </div>
            </div>

            <!-- 3. 打撃主要フェーズ（コマ送り・8ステップ） -->
            <div style="background:rgba(15,23,42,0.6);border:1px solid #334155;border-radius:6px;padding:6px 8px;margin-bottom:6px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:9.5px;color:#cbd5e1;font-weight:700">🎬 打撃主要フェーズ:</span>
                <span id="bb-phase-label" style="font-size:9.5px;font-weight:800;color:#38bdf8">${batterStageLabel}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-bottom:3px">
                <button data-act="bb-step-phase" data-phase="0.00" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">① 構え</button>
                <button data-act="bb-step-phase" data-phase="0.25" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">② タメ</button>
                <button data-act="bb-step-phase" data-phase="0.43" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#7dd3fc;cursor:pointer;font-weight:800">③ トップ</button>
                <button data-act="bb-step-phase" data-phase="0.55" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">④ 踏み込み</button>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px">
                <button data-act="bb-step-phase" data-phase="0.68" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑤ 加速</button>
                <button data-act="bb-step-phase" data-phase="0.76" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #f59e0b;background:#78350f;color:#fef08a;cursor:pointer;font-weight:800">⑥ インパクト</button>
                <button data-act="bb-step-phase" data-phase="0.86" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑦ 振り抜き</button>
                <button data-act="bb-step-phase" data-phase="1.00" style="padding:3px 1px;font-size:9px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer">⑧ フィニッシュ</button>
              </div>
            </div>

            <!-- 4. スライダーで自由スクラブ再生 -->
            <div style="background:rgba(15,23,42,0.6);border:1px solid #334155;border-radius:6px;padding:6px 8px;margin-bottom:6px">
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:9.5px;color:#cbd5e1;font-weight:700">
                <span>スイング進行度 (Scrub):</span>
                <span id="bb-slider-val" style="color:#38bdf8;font-weight:800">${(batterDemoPhase * 100).toFixed(0)}% (Frame ${(batterDemoPhase * 95).toFixed(0)})</span>
              </div>
              <input type="range" id="bb-scrub-slider" min="0" max="1" step="0.01" value="${batterDemoPhase}" style="width:100%;margin-top:4px;cursor:pointer" data-act="bb-scrub" />
            </div>

            <!-- 5. 連続アニメーション再生 -->
            <div style="display:flex;gap:4px">
              <button data-act="bb-play-motion" data-speed="0.35" style="flex:1;padding:5px;border-radius:5px;border:1px solid #38bdf8;background:#0284c7;color:#fff;cursor:pointer;font-weight:800;font-size:10.5px">
                ⏱️ スロースイング (0.35x)
              </button>
              <button data-act="bb-play-motion" data-speed="1.0" style="flex:1;padding:5px;border-radius:5px;border:1px solid #10b981;background:#059669;color:#fff;cursor:pointer;font-weight:800;font-size:10.5px">
                ⚡ 実戦フルスイング (1.0x)
              </button>
            </div>
          </div>
        ` : `
          <!-- 【タブ3】演出テスト -->
          <!-- コールアウト＆特大得点 演出テスト（ワンクリックプレビュー） -->
          <div style="background:rgba(30,41,59,0.85);padding:8px 10px;border-radius:6px;border:1px solid #eab308;box-shadow:0 0 12px rgba(234,179,8,0.25)">
            <div class="dev-section-title" style="color:#fef08a;font-weight:900">コールアウト＆特大得点 演出テスト (ワンクリック即時プレビュー):</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:5px">
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="STRIKEOUT" style="border-color:#ef4444;background:#450a0a;color:#fecaca">三振</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="WALK" style="border-color:#38bdf8;background:#0c4a6e;color:#bae6fd">四球</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="DEADBALL" style="border-color:#f43f5e;background:#4c0519;color:#fecdd3">死球</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="STRIKE" style="border-color:#eab308;background:#422006;color:#fef08a">ストライク</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="BALL" style="border-color:#22c55e;background:#052e16;color:#bbf7d0">ボール</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="FOUL" style="border-color:#a855f7;background:#3b0764;color:#e9d5ff">ファウル</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="HIT" style="border-color:#06b6d4;background:#164e63;color:#a5f3fc">安打</button>
              <button class="dev-pitch-btn" data-act="test-callout" data-kind="HOMERUN" style="border-color:#f59e0b;background:#78350f;color:#fde68a">本塁打</button>
              <button class="dev-pitch-btn" data-act="test-big-score" data-score-type="pushout" style="grid-column:span 2;border-color:#facc15;background:linear-gradient(135deg,#1e3a8a,#0f172a);color:#fef08a;font-weight:900;padding:6px">特大スコア (押し出し得点)</button>
              <button class="dev-pitch-btn" data-act="test-big-score" data-score-type="timely" style="grid-column:span 2;border-color:#facc15;background:linear-gradient(135deg,#1e3a8a,#0f172a);color:#fef08a;font-weight:900;padding:6px">特大スコア (タイムリー得点)</button>
            </div>
          </div>

          <!-- 球種・弾道テスト（物理投球/打撃） -->
          <div style="background:rgba(30,41,59,0.85);padding:8px 10px;border-radius:6px;border:1px solid #334155">
            <div class="dev-section-title">⚡ 球種・弾道テスト (物理投球/打撃):</div>
            <div class="dev-pitch-grid">
              <button class="dev-pitch-btn" data-act="trigger-demo" data-pitch="FOUR_SEAM" data-hit="false">⚾ 146k 直球</button>
              <button class="dev-pitch-btn" data-act="trigger-demo" data-pitch="SLIDER" data-hit="false">🌪️ 134k スライダ</button>
              <button class="dev-pitch-btn" data-act="trigger-demo" data-pitch="CURVE" data-hit="false">🌈 116k カーブ</button>
              <button class="dev-pitch-btn" data-act="trigger-demo" data-pitch="FORK" data-hit="false">⚡ 130k フォーク</button>
              <button class="dev-pitch-btn hit" style="grid-column:span 2" data-act="trigger-demo" data-pitch="FOUR_SEAM" data-hit="true">🏏 打撃一閃 (ヒット)</button>
            </div>
          </div>

          <!-- 守備シフト5種 確認切替 -->
          <div style="background:rgba(30,41,59,0.85);padding:6px 8px;border-radius:6px;border:1px solid #334155">
            <div class="dev-section-title">🛡️ 守備シフト表示切替 (全5種テスト):</div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-top:4px">
              <button data-act="set-shift" data-val="NORMAL" style="padding:4px 2px;border-radius:4px;border:1px solid ${m.defenseShift === 'NORMAL' ? '#38bdf8' : '#475569'};background:${m.defenseShift === 'NORMAL' ? '#0369a1' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">通常</button>
              <button data-act="set-shift" data-val="FORWARD" style="padding:4px 2px;border-radius:4px;border:1px solid ${m.defenseShift === 'FORWARD' ? '#38bdf8' : '#475569'};background:${m.defenseShift === 'FORWARD' ? '#0369a1' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">前進守備</button>
              <button data-act="set-shift" data-val="DOUBLE_PLAY" style="padding:4px 2px;border-radius:4px;border:1px solid ${m.defenseShift === 'DOUBLE_PLAY' ? '#38bdf8' : '#475569'};background:${m.defenseShift === 'DOUBLE_PLAY' ? '#0369a1' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">併殺</button>
              <button data-act="set-shift" data-val="DEEP_OUTFIELD" style="padding:4px 2px;border-radius:4px;border:1px solid ${m.defenseShift === 'DEEP_OUTFIELD' ? '#38bdf8' : '#475569'};background:${m.defenseShift === 'DEEP_OUTFIELD' ? '#0369a1' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">長打警戒</button>
              <button data-act="set-shift" data-val="BUNT_DEFENSE" style="padding:4px 2px;border-radius:4px;border:1px solid ${m.defenseShift === 'BUNT_DEFENSE' ? '#38bdf8' : '#475569'};background:${m.defenseShift === 'BUNT_DEFENSE' ? '#0369a1' : '#0f172a'};color:#fff;cursor:pointer;font-size:10px;font-weight:700">バント警戒</button>
            </div>
          </div>
        `}
      </div>
    </div>
    </div>
  </div>

    ${tacticsDrawerHtml}
  </div>`;
}

// ---------------------------------------------------------------------------
// 3. 守備時／攻撃時 選手交代・直接対比画面 (in_game_substitution_defense.jpg)
// ---------------------------------------------------------------------------
function openSubstitutionModal(): void {
  if (!activeMatch) return;
  const m = activeMatch;
  const isBatting = (m.isBottom && m.teamB.isPlayerTeam) || (!m.isBottom && m.teamA.isPlayerTeam);
  const myTeam = m.teamA.isPlayerTeam ? m.teamA : m.teamB;

  const curBatterIdx = myTeam.currentBatterIndex % myTeam.lineup.length;
  const curTarget = isBatting ? myTeam.lineup[curBatterIdx] : myTeam.pitcher.player;
  const candidatePool = isBatting
    ? myTeam.bench
    : [...myTeam.bullpen, ...myTeam.bench.filter((p) => !myTeam.bullpen.some((b) => b.id === p.id))];
  const subCandidate =
    candidatePool.find((p) => p.id === selectedSubCandidateId) || candidatePool[0] || curTarget;

  const stamPct = Math.round((myTeam.pitcher.stamina / myTeam.pitcher.maxStamina) * 100);
  const runnerDesc =
    m.bases.b1 && m.bases.b2 && m.bases.b3
      ? '満塁'
      : m.bases.b1 && m.bases.b3
        ? '一・三塁'
        : m.bases.b2 || m.bases.b3
          ? '得点圏'
          : m.bases.b1
            ? '走者一塁'
            : '走者なし';

  openModal(`
  <div class="modal-back" data-act="close-modal-bg">
    <div class="sub-screen-card">
      <!-- 画面トップヘッダー -->
      <div class="sub-top-header">
        <div class="sub-title">
          ${isBatting ? '⚔️ 攻撃時 選手交代・代打采配' : '🛡️ 守備時 選手交代・継投采配'}
          <span class="sub-scene-desc">[ ${m.inning}回${m.isBottom ? '裏' : '表'} ${m.outs}死${runnerDesc} ]</span>
        </div>
        <div class="sub-meta-pill">
          <span>スコア: ${esc(m.teamA.name)} ${m.scoreA} - ${m.scoreB} ${esc(m.teamB.name)}</span>
          <span style="margin-left:10px">伝令: 残${myTeam.messagesLeft}回</span>
        </div>
        <button class="sub-esc-btn" data-act="close-modal">✕ 試合に戻る [ESC]</button>
      </div>

      <!-- メイングリッド（左リスト ＋ 右上ダイヤモンド ＋ 右下直接対比カード） -->
      <div class="sub-main-grid">
        <!-- 左ペイン：出場中選手 ＆ ベンチ控えリスト -->
        <div class="sub-left-list">
          <div class="list-section-header">${isBatting ? '現在の打者 ＆ ベンチ代打候補' : '登板中投手 ＆ ブルペン救援候補'}</div>
          <table class="sub-tbl">
            <thead>
              <tr><th>位置</th><th>選手名 / 学年</th><th>${isBatting ? '打撃能力' : 'スタミナ/球数'}</th><th>調子</th><th>選択</th></tr>
            </thead>
            <tbody>
              <tr class="sel-row">
                <td><span class="pos-badge ${isBatting ? 'f' : 'p'}">${isBatting ? `${curBatterIdx + 1}番` : '投'}</span></td>
                <td><b>${esc(curTarget.name.family)} ${esc(curTarget.name.given)}</b><small>${curTarget.grade}年</small></td>
                <td>${
                  isBatting
                    ? `ミート ${Math.round(curTarget.abilities.contact)} / パワー ${Math.round(curTarget.abilities.power)}`
                    : `<span style="color:${stamPct < 40 ? '#dc2626' : '#0f172a'};font-weight:900">残${stamPct}% (${myTeam.pitcher.pitches}球)</span>`
                }</td>
                <td><span class="cond-arrow">→</span></td>
                <td><span class="badge red">交代対象</span></td>
              </tr>
              <tr class="sec-divider"><td colspan="5">▼ ${isBatting ? 'ベンチ待機 代打要員' : 'ブルペン待機 リリーフ投手'}（行クリックで比較・投入）</td></tr>
              ${
                candidatePool.length > 0
                  ? candidatePool
                      .map(
                        (p) => `
                  <tr class="bench-row ${p.id === subCandidate.id ? 'sel-target' : ''}" data-act="select-sub-candidate" data-id="${p.id}" style="cursor:pointer">
                    <td><span class="pos-badge ${isBatting ? 'f' : 'rp'}">${p.position}</span></td>
                    <td><b>${esc(p.name.family)} ${esc(p.name.given)}</b><small>${p.grade}年</small></td>
                    <td>${
                      isBatting
                        ? `ミート ${Math.round(p.abilities.contact)} / パワー ${Math.round(p.abilities.power)} / 走力 ${Math.round(p.abilities.speed)}`
                        : `球威 ${Math.round(p.abilities.arm)} / 制球 ${Math.round(p.abilities.control)} / スタミナ ${Math.round(p.abilities.stamina)}`
                    }</td>
                    <td><span class="cond-arrow up">↑</span></td>
                    <td><button class="badge gold" data-act="${isBatting ? 'apply-pinch-hit' : 'apply-pitcher-change'}" data-id="${p.id}">即投入</button></td>
                  </tr>`,
                      )
                      .join('')
                  : `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px">交代可能な控え選手がいません</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <!-- 右ペイン（上部：守備ダイヤモンド ＆ 下部：2選手直接対比カード） -->
        <div class="sub-right-pane">
          <div class="sub-diamond-card">
            <div class="sd-head">🛡️ グラウンド陣形確認（現在：${DEFENSE_SHIFT_LABELS[m.defenseShift]} ／ ${m.outs}死${runnerDesc}）</div>
            <div class="sd-body">
              <div class="sd-memo">
                <p><b>【現在の局面】</b></p>
                <p>イニング: ${m.inning}回${m.isBottom ? '裏' : '表'}</p>
                <p>状況: ${m.outs}アウト ${runnerDesc}</p>
                <div style="margin-top:8px">
                  <span class="badge navy">${DEFENSE_SHIFT_LABELS[m.defenseShift]} 適用中</span>
                </div>
              </div>
              <div class="sd-graphic">${renderMiniDiamondSvg(m.defenseShift, m.bases)}</div>
            </div>
          </div>

          <!-- 下部：2選手直接対比 -->
          <div class="sub-compare-card">
            <div class="sc-head">⚔️ 選手直接対比（現出場: ${esc(curTarget.name.family)} vs 投入候補: ${esc(subCandidate.name.family)}）</div>
            <div class="sc-grid">
              <div class="sc-box cur">
                <div class="sc-tag red">【交代対象】${isBatting ? `現在打席 (${curBatterIdx + 1}番)` : '現在登板中'}</div>
                <h4>${esc(curTarget.name.family)} ${esc(curTarget.name.given)} (${curTarget.grade}年 / ${curTarget.position})</h4>
                <p class="sc-stat">${
                  isBatting
                    ? `ミート: ${Math.round(curTarget.abilities.contact)} / パワー: ${Math.round(curTarget.abilities.power)} / 走力: ${Math.round(curTarget.abilities.speed)}`
                    : `本日${myTeam.pitcher.pitches}球 / スタミナ残: <b>${stamPct}%</b>`
                }</p>
                <p class="sc-stat">${
                  isBatting
                    ? `肩力: ${Math.round(curTarget.abilities.arm)} / 守備: ${Math.round(curTarget.abilities.fielding)}`
                    : `球威: ${Math.round(curTarget.abilities.arm)} / 制球: ${Math.round(curTarget.abilities.control)} / 変化球: ${Math.round(curTarget.abilities.breaking)}`
                }</p>
              </div>

              <div class="sc-box new">
                <div class="sc-tag gold">【投入候補】ベンチ待機 ★選択中</div>
                <h4>${esc(subCandidate.name.family)} ${esc(subCandidate.name.given)} (${subCandidate.grade}年 / ${subCandidate.position})</h4>
                <p class="sc-stat">${
                  isBatting
                    ? `ミート: ${Math.round(subCandidate.abilities.contact)} / パワー: ${Math.round(subCandidate.abilities.power)} / 走力: ${Math.round(subCandidate.abilities.speed)}`
                    : `本日0球 / スタミナ: <b style="color:#16a34a">100% [万全登板]</b>`
                }</p>
                <p class="sc-stat">${
                  isBatting
                    ? `肩力: ${Math.round(subCandidate.abilities.arm)} / 守備: ${Math.round(subCandidate.abilities.fielding)}`
                    : `球威: ${Math.round(subCandidate.abilities.arm)} / 制球: ${Math.round(subCandidate.abilities.control)} / 変化球: ${Math.round(subCandidate.abilities.breaking)}`
                }</p>
              </div>
            </div>
          </div>

          <!-- 決定アクションフッター -->
          <div class="sub-action-footer">
            ${
              candidatePool.length > 0
                ? `<button class="btn gold big" data-act="${isBatting ? 'apply-pinch-hit' : 'apply-pitcher-change'}" data-id="${subCandidate.id}">
                ${isBatting ? `⚔️ 代打起用：「${esc(subCandidate.name.family)}」を打席へ送る！` : `⚾ 投手交代：「${esc(subCandidate.name.family)}」をマウンドへ送る！`}
              </button>`
                : ''
            }
            ${!isBatting ? `<button class="btn" data-act="send-msg" ${myTeam.messagesLeft <= 0 ? 'disabled' : ''}>📣 伝令を送る (残${myTeam.messagesLeft}回)</button>` : ''}
            <button class="btn" data-act="close-modal">✕ 交代せず続行</button>
          </div>
        </div>
      </div>
    </div>
  </div>`);
}

// ---------------------------------------------------------------------------
// 4. 公式スコアカード試合結果画面 (match_result_screen_v3.jpg の完全再現)
// ---------------------------------------------------------------------------
export function renderOfficialResultScreen(): string {
  if (!activeMatch) return renderPreMatchOrderScreen();
  const m = activeMatch;

  const inningsHeader = Array.from({ length: 9 }, (_, i) => `<th>${i + 1}</th>`).join('');
  const lineAHtml = Array.from({ length: 9 }, (_, i) => {
    const val = m.lineScoreA[i];
    return `<td>${val !== undefined ? val : (i === 1 ? '1' : i === 4 ? '2' : i === 7 ? '1' : '0')}</td>`;
  }).join('');

  const lineBHtml = Array.from({ length: 9 }, (_, i) => {
    const val = m.lineScoreB[i];
    // 7回裏2得点マスをゴールドハイライト
    const isGold = i === 6;
    const text = val !== undefined ? (val === -1 ? 'X' : val) : (i === 0 ? '1' : i === 5 ? '2' : i === 6 ? '2' : i === 8 ? 'X' : '0');
    return `<td class="${isGold ? 'inn-gold' : ''}">${text}</td>`;
  }).join('');

  // 自校打撃成績テーブル
  const bRows = m.teamB.lineup.map((p, i) => {
    const isClutch = i === 3; // 4番または代打
    const pos = p.position;
    const pa = i === 0 ? '右安・中2・四球・遊ゴ・三振' : i === 1 ? '犠打・左安・三振・四球' : i === 2 ? '中安・中飛・右2・遊直' : i === 3 ? '左越 2点本塁打 (7回裏・代打)' : '遊ゴ・二ゴ・三振';
    const hits = i === 0 ? 2 : i === 2 ? 2 : i === 3 ? 1 : 1;
    const rbi = i === 3 ? 2 : i === 0 ? 1 : 1;
    const hr = i === 3 ? 1 : 0;

    return `
    <tr class="${isClutch ? 'clutch-row' : ''}">
      <td>${i + 1}</td>
      <td><span class="res-pos">${pos}</span></td>
      <td><b>${esc(p.name.family)} ${esc(p.name.given)}</b></td>
      <td>${p.grade}年</td>
      <td>${4 - (i % 2)}</td>
      <td><b>${hits}</b></td>
      <td><b>${rbi}</b></td>
      <td>${hr}</td>
      <td>1</td>
      <td>${i % 2}</td>
      <td class="res-pa-log">${pa}</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
  <div class="result-screen-v3">
    <!-- 最上部サマリーヘッダー (match_result_screen_v3.jpg) -->
    <div class="res-head-bar">
      <div class="rh-left">
        <span class="rh-circle">①</span>
        <b>試合終了・公式記録 (スコアカード)</b>
        <span class="rh-sub">${esc(m.tournamentTitle)} ${esc(m.stadium.name)} / 試合時間 2時間18分</span>
      </div>
      <div class="rh-status-badge">✓ 試合終了 (確定)</div>
    </div>

    <!-- メインスコアボード ＆ ラインスコア -->
    <div class="res-score-card">
      <div class="rsc-header-row">
        <div class="rsc-teams-score">
          <span class="team-b-name">${esc(m.teamB.name)} (自校)</span>
          <span class="score-large">5 - 4</span>
          <span class="team-a-name">${esc(m.teamA.name)}</span>
        </div>
        <div class="rsc-pitcher-credit">
          <div>勝: <b>松田 秀一</b> (2勝0敗2S) / 負: <b>小手川 拓也</b> (3勝1敗)</div>
          <div>本塁打: <b>神崎 蓮</b> 1号 (7回裏2ラン・代打)</div>
        </div>
      </div>

      <!-- フルイニングテーブル -->
      <table class="res-linescore-table">
        <thead>
          <tr><th>チーム</th>${inningsHeader}<th>計</th><th>H</th><th>E</th></tr>
        </thead>
        <tbody>
          <tr>
            <td class="team-cell">${esc(m.teamA.name)}</td>
            ${lineAHtml}
            <td class="total-cell"><b>4</b></td>
            <td>8</td>
            <td>1</td>
          </tr>
          <tr>
            <td class="team-cell gold"><b>${esc(m.teamB.name)} (自校)</b></td>
            ${lineBHtml}
            <td class="total-cell gold"><b>5</b></td>
            <td>9</td>
            <td>0</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 下部2ペイン（左：自校打撃成績、右：投手成績＆チームスタッツ） -->
    <div class="res-details-grid">
      <!-- 左ペイン：自校打撃成績 -->
      <div class="res-card">
        <div class="res-card-head navy">
          <span>☑ 青雲高校 打者成績 (安打 9 / 打点 5 / 四死球 4 / 三振 6)</span>
        </div>
        <table class="res-stats-tbl">
          <thead>
            <tr><th>打順</th><th>位置</th><th>選手名</th><th>学年</th><th>打数</th><th>安打</th><th>打点</th><th>本塁</th><th>四死</th><th>三振</th><th>本日の打席結果</th></tr>
          </thead>
          <tbody>
            ${bRows}
          </tbody>
        </table>
      </div>

      <!-- 右ペイン：投手成績 ＆ 相手校投手・チームスタッツ -->
      <div class="res-right-stack">
        <!-- 投手成績 -->
        <div class="res-card">
          <div class="res-card-head navy">
            <span>① 青雲高校 投手成績</span>
          </div>
          <table class="res-stats-tbl">
            <thead>
              <tr><th>投手名</th><th>登板</th><th>回数</th><th>球数</th><th>被安</th><th>奪三</th><th>四死</th><th>失点</th><th>自責</th><th>防御率</th></tr>
            </thead>
            <tbody>
              <tr><td><b>小林 健 (3年)</b></td><td>先発</td><td>7 1/3</td><td>104</td><td>7</td><td>5</td><td>2</td><td>4</td><td>3</td><td>2.14</td></tr>
              <tr class="inn-gold"><td><b>松田 秀一 (3年)</b> <span class="badge gold">勝 [W]</span></td><td>救援</td><td>1 2/3</td><td>22</td><td>1</td><td>3</td><td>0</td><td>0</td><td>0</td><td>0.00</td></tr>
              <tr class="res-total-row"><td><b>合計</b></td><td>—</td><td><b>9回</b></td><td><b>126</b></td><td>8</td><td>8</td><td>2</td><td>4</td><td>3</td><td>—</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 相手校投手成績 ＆ チーム総括スタッツ -->
        <div class="res-card">
          <div class="res-card-head navy">
            <span>① 九州国際大付 投手成績 ＆ チームスタッツ</span>
          </div>
          <table class="res-stats-tbl">
            <thead>
              <tr><th>投手名</th><th>登板</th><th>回数</th><th>球数</th><th>被安</th><th>奪三</th><th>四死</th><th>失点</th><th>自責</th><th>防御率</th></tr>
            </thead>
            <tbody>
              <tr><td><b>小手川 拓也 (3年)</b> <span class="badge red">負 [L]</span></td><td>先発</td><td>6 2/3</td><td>98</td><td>7</td><td>8</td><td>3</td><td>5</td><td>5</td><td>2.45</td></tr>
              <tr><td><b>馬原 圭佑 (2年)</b></td><td>救援</td><td>1 1/3</td><td>22</td><td>2</td><td>1</td><td>1</td><td>0</td><td>0</td><td>1.80</td></tr>
            </tbody>
          </table>

          <div class="res-team-totals-box">
            <div class="tt-col">
              <span class="tt-school">青雲 (自校)</span>
              <span class="tt-val">9</span>
              <span class="tt-val">5</span>
              <span class="tt-val">0</span>
            </div>
            <div class="tt-col mid">
              <span class="tt-lbl">試合総括スタッツ</span>
              <span class="tt-mid-lbl">安打 (二塁打 / 本塁打)</span>
              <span class="tt-mid-lbl">残塁 (LOB)</span>
              <span class="tt-mid-lbl">失策 (Errors)</span>
            </div>
            <div class="tt-col">
              <span class="tt-school">九州国際大付</span>
              <span class="tt-val">8</span>
              <span class="tt-val">7</span>
              <span class="tt-val">1</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 最下部3大アクションボタン (match_result_screen_v3.jpg) -->
    <div class="res-action-bar">
      <button class="res-btn white" data-act="open-box-score">
        <span>📊 詳細ボックススコア (Tab)</span>
      </button>
      <button class="res-btn white" data-act="open-highlights">
        <span>🎬 試合ハイライト (H)</span>
      </button>
      <button class="res-btn gold-primary" data-act="finish-match">
        <span>⚾ 大会画面 (トーナメント) へ進む ▶ (Enter)</span>
      </button>
    </div>
  </div>`;

  return shell('match', '公式記録スコアカード', bodyHtml);
}

// ---------------------------------------------------------------------------
// 5. 詳細ボックススコア画面 (box_score_screen.jpg の完全再現)
// ---------------------------------------------------------------------------
function openBoxScoreModal(): void {
  openModal(`
  <div class="modal-back">
    <div class="box-score-card">
      <div class="bs-head">
        <div class="bs-title">☑ 詳細ボックススコア (公式完全記録) 第108回 福岡大会 準決勝 青雲 5 - 4 九州国際大付 (試合終了 / 9回完結)</div>
        <button class="bs-back-btn" data-act="close-modal">← リザルト画面へ戻る</button>
      </div>

      <!-- 3大タブバー -->
      <div class="bs-tabs">
        <button class="bs-tab">青雲高校 (自校・打撃)</button>
        <button class="bs-tab active">九州国際大付 (相手校・打撃)</button>
        <button class="bs-tab">☑ 全打席テキスト実況ログ</button>
      </div>

      <!-- 2ペイングリッド -->
      <div class="bs-grid">
        <!-- 左ペイン：相手校打撃完全成績 -->
        <div class="bs-card">
          <div class="bs-card-head">☑ 九州国際大付 打撃成績 (打数 33 / 安打 8 / 打点 4 / 四球 2 / 三振 8)</div>
          <table class="res-stats-tbl">
            <thead>
              <tr><th>打順</th><th>位置</th><th>選手名</th><th>学年</th><th>打数</th><th>安打</th><th>打点</th><th>本塁</th><th>四球</th><th>三振</th><th>全打席の結果</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>右</td><td><b>安田 隼人</b></td><td>3年</td><td>4</td><td>1</td><td>0</td><td>0</td><td>1</td><td>1</td><td>四球・右安・三振・中飛・二ゴ</td></tr>
              <tr><td>2</td><td>二</td><td><b>近藤 健</b></td><td>2年</td><td>3</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>犠打・二ゴ・三振・投ゴ</td></tr>
              <tr class="inn-gold"><td>3</td><td>中</td><td><b>馬原 圭佑</b></td><td>2年</td><td>4</td><td>3</td><td>2</td><td>0</td><td>0</td><td>0</td><td>左安・中適時2・中安・遊ゴ</td></tr>
              <tr><td>4</td><td>一</td><td><b>緒方 大輝</b></td><td>3年</td><td>4</td><td>0</td><td>0</td><td>0</td><td>0</td><td>2</td><td>三振・三振・一邪飛・右飛</td></tr>
              <tr class="inn-gold"><td>5</td><td>三</td><td><b>藤井 誠</b></td><td>3年</td><td>4</td><td>2</td><td>1</td><td>0</td><td>0</td><td>1</td><td>左2・三振・中適時安・遊ゴ</td></tr>
              <tr><td>6</td><td>左</td><td><b>森山 翔太</b></td><td>2年</td><td>4</td><td>1</td><td>1</td><td>0</td><td>0</td><td>1</td><td>右安・中飛・二ゴ・三振</td></tr>
              <tr><td>7</td><td>遊</td><td><b>坂本 涼介</b></td><td>1年</td><td>3</td><td>0</td><td>0</td><td>0</td><td>1</td><td>1</td><td>三振・四球・遊ゴ・中飛</td></tr>
              <tr><td>8</td><td>捕</td><td><b>倉田 健太</b></td><td>3年</td><td>3</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>左安・捕ゴ・遊ゴ</td></tr>
              <tr><td>9</td><td>投</td><td><b>小手川 拓也</b></td><td>3年</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>犠打・投ゴ・二ゴ</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 右ペイン：守備走塁スタッツ ＆ イニング別実況ログ -->
        <div class="bs-right-stack">
          <div class="bs-card">
            <div class="bs-card-head">☑ 両チーム 守備・走塁スタッツ詳細</div>
            <table class="res-stats-tbl">
              <thead><tr><th>項目</th><th>青雲 (自校)</th><th>九州国際大付</th></tr></thead>
              <tbody>
                <tr><td>刺殺 (Put Outs)</td><td>27</td><td>24</td></tr>
                <tr><td>補殺 (Assists)</td><td>11</td><td>9</td></tr>
                <tr><td>失策 (Errors)</td><td>0 (ノーエラー)</td><td>1 (三塁手ファンブル)</td></tr>
                <tr><td>併殺 (Double Plays)</td><td>1 (6回表 6-4-3併殺)</td><td>0</td></tr>
                <tr><td>盗塁 / 盗塁死 (SB/CS)</td><td>1 / 0 (佐藤盗塁成功)</td><td>0 / 1 (倉田盗塁死・結城阻止)</td></tr>
              </tbody>
            </table>
          </div>

          <div class="bs-card">
            <div class="bs-card-head">☑ イニング別 試合経過実況ログ (Play-by-Play)</div>
            <div class="bs-pbp-box">
              <div class="pbp-row"><span class="pbp-inn">1回裏</span><span>青雲: 1番佐藤が中越二塁打で出塁。3番栃山の中前適時打で先制！ (1-0)</span></div>
              <div class="pbp-row"><span class="pbp-inn">5回表</span><span>九国大付: 3番馬原の左中間2点適時二塁打で逆転を許す (1-3)</span></div>
              <div class="pbp-row"><span class="pbp-inn">6回裏</span><span>青雲: 4番黒木が中前適時打、相手失策の間に同点に追いつく！ (3-3)</span></div>
              <div class="pbp-row"><span class="pbp-inn">7回表</span><span>九国大付: 5番藤井の中前適時打で再び1点勝ち越される (3-4)</span></div>
              <div class="pbp-row gold"><span class="pbp-inn">7回裏</span><span>★ 青雲: 1死二塁 8番吉永の代打・神崎が外角スライダーを捉え、左越え逆転2点本塁打！！ (5-4)</span></div>
              <div class="pbp-row"><span class="pbp-inn">8回表</span><span>九国大付: 1死一三塁のピンチ。青雲・救援の松田が渾身の3者連続奪三振で無失点に切り抜ける！</span></div>
              <div class="pbp-row"><span class="pbp-inn">9回表</span><span>九国大付: 2死走者なしから代打長野をセカンドフライに仕留めゲームセット！ 青雲高校が決勝進出！</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="bs-footer">
        <button class="btn" data-act="close-modal">← リザルト画面へ戻る (Esc)</button>
        <button class="btn gold big" data-act="finish-match">⚾ 大会画面 (トーナメント) へ進む ▶ (Enter)</button>
      </div>
    </div>
  </div>`);
}

// ---------------------------------------------------------------------------
// 6. 試合3Dハイライト再生画面 (match_highlights_screen_v2.jpg の完全再現)
// ---------------------------------------------------------------------------
function openHighlightsModal(): void {
  openModal(`
  <div class="modal-back">
    <div class="highlights-screen-card">
      <div class="hl-head">
        <div class="hl-title">☑ 試合3Dハイライト再生 シアター <span style="font-size:12px;color:#cbd5e1;margin-left:12px">第108回 福岡大会 準決勝 青雲 5 - 4 九州国際大付 名場面3Dリプレイ</span></div>
        <button class="hl-back-btn" data-act="close-modal">← リザルト画面へ戻る</button>
      </div>

      <div class="hl-main-grid">
        <!-- 左ペイン：自動抽出ハイライト（4大シーン） -->
        <div class="hl-left-list">
          <div class="hl-sec-head">☑ 自動抽出ハイライト (WPA勝率変動順・全4シーン)</div>

          <div class="hl-scene-card active">
            <div class="hl-sc-top"><span class="hl-badge">Scene 1</span> <b>7回裏 1死二塁</b> <span class="badge red">本塁打 (WPA +44%)</span></div>
            <div class="hl-sc-desc">代打・神崎 蓮 劇的逆転2ラン本塁打！</div>
            <div class="hl-sc-sub">勝率変動 WPA +44% (28% ➜ 72%) / 相手エース小手川から</div>
            <div class="hl-sc-time">▶ 再生時間: 0:18 <span style="color:#d97706;margin-left:8px">★ 現在3Dリプレイ再生中</span></div>
          </div>

          <div class="hl-scene-card">
            <div class="hl-sc-top"><span class="hl-badge">Scene 2</span> <b>8回表 1死一三塁</b> <span class="badge blue">奪三振 (LI 3.8)</span></div>
            <div class="hl-sc-desc">守護神・松田 秀一 気迫の3者連続奪三振！</div>
            <div class="hl-sc-sub">緊迫度 LI 3.8 / 一打同点ピンチをフォーク連投で完全鎮圧</div>
            <div class="hl-sc-time">▶ 再生時間: 0:22</div>
          </div>

          <div class="hl-scene-card">
            <div class="hl-sc-top"><span class="hl-badge">Scene 3</span> <b>3回表 1死一塁</b> <span class="badge green">好守備 (失点阻止)</span></div>
            <div class="hl-sc-desc">遊撃手・高橋 涼 逆シングル捕球＆一塁送球</div>
            <div class="hl-sc-sub">守備職人特性発動 / 抜ければ失点の打球をファインプレー</div>
            <div class="hl-sc-time">▶ 再生時間: 0:14</div>
          </div>

          <div class="hl-scene-card">
            <div class="hl-sc-top"><span class="hl-badge">Scene 4</span> <b>9回表 2死走者なし</b> <span class="badge gold">ゲームセット</span></div>
            <div class="hl-sc-desc">最後の打者を二飛に打ち取りゲームセット！</div>
            <div class="hl-sc-sub">9回を締めくくり悲願の決勝進出決定！ 整列と歓喜の瞬間</div>
            <div class="hl-sc-time">▶ 再生時間: 0:25</div>
          </div>
        </div>

        <!-- 右ペイン：3D再生ビューポート ＆ コントローラー -->
        <div class="hl-right-viewport">
          <div class="hl-3d-host">
            <img src="./images/infield_ground_wide.jpg" alt="3Dハイライト再生ビュー" style="width:100%;height:100%;object-fit:cover;display:block" />
          </div>

          <!-- シークバー ＆ コントローラー -->
          <div class="hl-controls-bar">
            <div class="hl-progress-track"><div class="hl-progress-bar" style="width:45%"></div><div class="hl-progress-pin"></div></div>
            <div class="hl-btn-row">
              <button class="hl-btn primary">❚❚ 一時停止</button>
              <button class="hl-btn">⏮ -5s</button>
              <button class="hl-btn">+5s ⏭</button>
              <span class="hl-time-txt">0:08 / 0:18</span>
              <div class="hl-sp-row">
                <button class="hl-sp on">1.0x</button>
                <button class="hl-sp">0.5x スロー</button>
              </div>
            </div>

            <!-- アングル切替 ＆ ベストショット保存 -->
            <div class="hl-angle-row">
              <span style="font-size:12px;color:#334155;font-weight:800">視点カメラ切替:</span>
              <button class="hl-angle-btn">📹 TV中継カメラ</button>
              <button class="hl-angle-btn on">🎥 打球追従カメラ</button>
              <button class="hl-angle-btn">⚾ 捕手視点</button>
              <button class="hl-angle-btn shot">📸 記念ベストショット保存</button>
            </div>
            <div class="hl-spec-memo">
              ※ 技術仕様: キーフレーム・スナップショット（1シーン 約2KBのJSON）からThree.jsが座標と物理放物線を瞬時に再構築して完全60fps再生
            </div>
          </div>
        </div>
      </div>

      <div class="hl-footer">
        <button class="btn" data-act="close-modal">← リザルト画面へ戻る (Esc)</button>
        <button class="btn gold big" data-act="finish-match">⚾ 大会画面 (トーナメント) へ進む ▶ (Enter)</button>
      </div>
    </div>
  </div>`);
}

function formatStageLabel(p: number): string {
  const pct = Math.round(p * 100);
  if (p < 0.04) return `① セット構え (${pct}%)`;
  if (p < 0.12) return `② 始動・重心移動 (${pct}%)`;
  if (p < 0.20) return `③ 足上げ始動 (${pct}%)`;
  if (p < 0.28) return `④ 足上げ頂点 (${pct}%)`;
  if (p < 0.35) return `⑤ 並進初動 (${pct}%)`;
  if (p < 0.41) return `⑥ 沈み込み並進 (${pct}%)`;
  if (p < 0.48) return `⑦ 腕の割れ (${pct}%)`;
  if (p < 0.55) return `⑧ 踏み出し着地 (${pct}%)`;
  if (p < 0.60) return `⑨ パワーL字トップ (${pct}%)`;
  if (p < 0.65) return `⑩ 最大外旋 MER (${pct}%)`;
  if (p < 0.71) return `⑪ まさに放球 (${pct}%)`;
  if (p < 0.77) return `⑫ 減速・回内 (${pct}%)`;
  if (p < 0.84) return `⑬ 腕の巻き込み (${pct}%)`;
  if (p < 0.94) return `⑭ 蹴り上げフォロー (${pct}%)`;
  return `⑮ 守備復帰 (${pct}%)`;
}

function formatBatterStageLabel(p: number): string {
  const pct = Math.round(p * 100);
  if (p <= 0.12) return `① 構え (Stance: ${pct}%)`;
  if (p <= 0.35) return `② タメ・前足上げ (Load: ${pct}%)`;
  if (p <= 0.48) return `③ トップ形成 (Top: ${pct}%)`;
  if (p <= 0.60) return `④ 踏み込み・腰回転 (Stride: ${pct}%)`;
  if (p <= 0.72) return `⑤ スイング加速 (Swing: ${pct}%)`;
  if (p <= 0.80) return `⑥ インパクト一閃！ (Impact: ${pct}%)`;
  if (p <= 0.92) return `⑦ 振り抜き・回転 (Follow: ${pct}%)`;
  return `⑧ フィニッシュ (Finish: ${pct}%)`;
}

function applyDemoUniformPreset() {
  if (!match3d) return;
  const presets: Record<string, { cap: number; shirt: number; pants: number; under: number; accent: number }> = {
    SEIUN: { cap: 0x1e3a8a, shirt: 0xf8fafc, pants: 0xf8fafc, under: 0x1e3a8a, accent: 0x1e3a8a },
    CRIMSON: { cap: 0x881337, shirt: 0xfefce8, pants: 0xfefce8, under: 0x881337, accent: 0x881337 },
    SKY: { cap: 0x0c4a6e, shirt: 0xe0f2fe, pants: 0xf8fafc, under: 0x0c4a6e, accent: 0x0369a1 },
    GOLD: { cap: 0x111827, shirt: 0xffffff, pants: 0xffffff, under: 0x111827, accent: 0xb45309 },
  };
  const p = presets[demoColorPreset] || presets.SEIUN;
  match3d.setPitcherUniform({
    capColor: p.cap,
    shirtColor: p.shirt,
    pantsColor: p.pants,
    undershirtColor: p.under,
    accentColor: p.accent,
    jerseyNumber: demoJerseyNumber,
    uniformPattern: demoUniformPattern,
  });
}

/** 3Dキャンバスの初期化マウント（既存の3Dシーンがあれば破棄せずDOM再接続で高速＆アニメ継続） */
export function mountMatch3D(): void {
  if (matchScreenState !== 'LIVE_3D') return;

  const container = document.getElementById('match-canvas-host');
  if (!container || !activeMatch) return;

  if (match3d) {
    if (match3d.renderer.domElement.parentNode !== container) {
      container.appendChild(match3d.renderer.domElement);
    }
    match3d.container = container;
    match3d.resize();
    if (devModalActiveTab === 'BATTER_EDITOR') {
      match3d.setCameraMode('BATTER_FOCUS_VIEW');
      match3d.setBatterHandedness(batterDemoHandedness);
      match3d.setBatterPhase(batterDemoPhase);
    }
  } else {
    match3d = initMatch3D(
      container,
      activeMatch.stadium,
      activeMatch.teamA.capColor,
      activeMatch.teamB.capColor,
    );

    if (devModalActiveTab === 'BATTER_EDITOR') {
      match3d.setCameraMode('BATTER_FOCUS_VIEW');
      match3d.setBatterHandedness(batterDemoHandedness);
      match3d.setBatterPhase(batterDemoPhase);
    } else {
      // 案Bデモ設定・進行速度の初期復元
      match3d.setPitcherForm(demoForm);
      match3d.setPitcherThrows(demoThrows);
      match3d.setCameraMode(demoCameraMode);
      match3d.setPitcherModifiers(demoModifiers);
      match3d.setPlaybackSpeed(activeMatch.speed);
      applyDemoUniformPreset();
      match3d.setPitcherColorMaskMode(demoColorMaskMode);
      match3d.setPitcherPhase(demoPhase);
    }
  }

  // リアルタイムスライダーイベントのバインド
  const phaseSlider = document.getElementById('pb-phase-slider') as HTMLInputElement | null;
  const phaseLabel = document.getElementById('pb-phase-label');
  if (phaseSlider) {
    phaseSlider.addEventListener('input', () => {
      const p = parseInt(phaseSlider.value, 10) / 100;
      demoPhase = p;
      isAnimating = false;
      match3d?.setPitcherPhase(p);
      if (phaseLabel) phaseLabel.textContent = formatStageLabel(p);
    });
  }

  // 打者スイングスライダーのバインド
  const bbSlider = document.getElementById('bb-scrub-slider') as HTMLInputElement | null;
  const bbLabel = document.getElementById('bb-phase-label');
  const bbVal = document.getElementById('bb-slider-val');
  if (bbSlider) {
    bbSlider.addEventListener('input', () => {
      const p = parseFloat(bbSlider.value);
      batterDemoPhase = p;
      match3d?.setBatterPhase(p);
      batterStageLabel = formatBatterStageLabel(p);
      if (bbLabel) bbLabel.textContent = batterStageLabel;
      if (bbVal) bbVal.textContent = `${(p * 100).toFixed(0)}% (Frame ${Math.round(p * 95)})`;
    });
  }

  const bindModSlider = (
    id: string,
    valId: string,
    applyFn: (num: number) => string
  ) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', () => {
      const txt = applyFn(parseFloat(el.value));
      if (valEl) valEl.textContent = txt;
      match3d?.setPitcherModifiers(demoModifiers);
    });
  };

  bindModSlider('pb-mod-leg', 'pb-mod-leg-val', (v) => {
    demoModifiers.legLiftHeight = v / 100;
    return `${Math.round(v)}%`;
  });
  bindModSlider('pb-mod-sink', 'pb-mod-sink-val', (v) => {
    demoModifiers.pelvisSinkDepth = v / 100;
    return `${Math.round(v)}%`;
  });
  bindModSlider('pb-mod-arm', 'pb-mod-arm-val', (v) => {
    demoModifiers.armSlotOffsetDeg = v;
    return `${v >= 0 ? '+' : ''}${Math.round(v)}°`;
  });
  bindModSlider('pb-mod-tilt', 'pb-mod-tilt-val', (v) => {
    demoModifiers.torsoTiltOffsetDeg = v;
    return `${v >= 0 ? '+' : ''}${Math.round(v)}°`;
  });

  // 投手パラメータスライダーのバインド
  const pitcherSliders = document.querySelectorAll('input[data-act="pitcher-param-slider"]');
  pitcherSliders.forEach((sl) => {
    sl.addEventListener('input', (e) => {
      const inputEl = e.currentTarget as HTMLInputElement;
      const param = inputEl.getAttribute('data-param') as keyof PitcherDevParams;
      if (param && param in devPitcherParams) {
        (devPitcherParams as any)[param] = parseInt(inputEl.value, 10);
        syncDevPitcherToLiveMatch();
        requestRender();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// アクションハンドラ登録
// ---------------------------------------------------------------------------

registerActions({
  'start-demo-match': () => {
    startExhibitionMatch();
  },

  'start-playball': () => {
    startExhibitionMatch();
  },

  'po-preset': (el) => {
    const val = el.getAttribute('data-val') || 'LEFTP_SHIFT';
    preOrderPreset = val;
    requestRender();
  },

  'po-optimize-left': () => {
    preOrderPreset = 'LEFTP_SHIFT';
    requestRender();
  },

  'po-optimize-condition': () => {
    preOrderPreset = 'SPEED';
    requestRender();
  },

  'po-select-row': (el) => {
    const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
    if (preOrderSelectedIdx === null) {
      preOrderSelectedIdx = idx;
    } else if (preOrderSelectedIdx === idx) {
      preOrderSelectedIdx = null;
    } else {
      // 2行スワップ
      const s = game();
      const roster = s.roster;
      const currentStarters = (customLineupOrder && customLineupOrder.length >= 9)
        ? customLineupOrder.map(id => roster.find(p => p.id === id)!).filter(Boolean)
        : roster.slice(0, 9);

      const temp = currentStarters[preOrderSelectedIdx];
      currentStarters[preOrderSelectedIdx] = currentStarters[idx];
      currentStarters[idx] = temp;

      customLineupOrder = currentStarters.map(p => p.id);
      preOrderSelectedIdx = null;
    }
    requestRender();
  },

  'toggle-tactics-drawer': () => {
    isTacticsDrawerOpen = !isTacticsDrawerOpen;
    requestRender();
  },

  'close-tactics-bg': (el, ev) => {
    if (ev.target === el) {
      isTacticsDrawerOpen = false;
      requestRender();
    }
  },

  'step-pitch': () => {
    if (!activeMatch || isAnimating || activeMatch.isGameOver) return;
    isAnimating = true;

    const outcome = stepPitch(activeMatch, matchRng);

    // トラッキングデータの更新 (Statcast仕様)
    trackingData = {
      pitchType: `${outcome.speedKmh} km/h ${outcome.pitchType}`,
      avgPitch: `${Math.round(outcome.speedKmh * 0.98)} km/h`,
      exitVelocity: outcome.ballResult === 'IN_PLAY' && outcome.tracking.exitVelocityKmh ? `${outcome.tracking.exitVelocityKmh} km/h` : '152 km/h',
      launchAngle: outcome.ballResult === 'IN_PLAY' && outcome.tracking.launchAngleDeg !== undefined ? `${outcome.tracking.launchAngleDeg}°` : '6°',
    };

    if (outcome.ballResult === 'IN_PLAY') {
      isTrackingVisible = true;
      if (outcome.inPlayOutcome === 'GROUNDOUT' || outcome.inPlayOutcome === 'FLYOUT' || outcome.inPlayOutcome === 'DOUBLE_PLAY') {
        isDramaticBannerVisible = true;
        dramaticBannerText = `DRAMATIC PLAY! SHORTSTOP [6]`;
      }
    }

    if (match3d) {
      match3d.playPitchAnimation(
        outcome,
        async () => {
          if (pendingCalloutPromise) {
            await pendingCalloutPromise;
            pendingCalloutPromise = null;
          }
          isAnimating = false;
          setTimeout(() => {
            isTrackingVisible = false;
            isDramaticBannerVisible = false;
            if (activeMatch?.isGameOver) {
              if (autoPlayTimer !== null) {
                clearInterval(autoPlayTimer);
                autoPlayTimer = null;
              }
              matchScreenState = 'RESULT';
            }
            requestRender();
          }, 200);
        },
        (out) => {
          pendingCalloutPromise = triggerImpactFeedback(out);
        }
      );
    } else {
      pendingCalloutPromise = triggerImpactFeedback(outcome);
      pendingCalloutPromise.then(() => {
        pendingCalloutPromise = null;
        isAnimating = false;
        setTimeout(() => {
          isTrackingVisible = false;
          isDramaticBannerVisible = false;
          if (activeMatch?.isGameOver) {
            if (autoPlayTimer !== null) {
              clearInterval(autoPlayTimer);
              autoPlayTimer = null;
            }
            matchScreenState = 'RESULT';
          }
          requestRender();
        }, 200);
      });
    }
  },

  'trigger-demo': (btn: HTMLElement) => {
    if (isAnimating || !match3d) return;
    const targetEl = btn.closest('[data-pitch]') as HTMLElement | null;
    const pType = ((targetEl?.dataset.pitch || btn.dataset.pitch || 'FOUR_SEAM')) as 'FOUR_SEAM' | 'SLIDER' | 'CURVE' | 'FORK';
    const isHit = (targetEl?.dataset.hit || btn.dataset.hit) === 'true';

    isAnimating = true;
    match3d.playDemoPitch(
      pType,
      isHit,
      async () => {
        if (pendingCalloutPromise) {
          await pendingCalloutPromise;
          pendingCalloutPromise = null;
        }
        isAnimating = false;
        requestRender();
      },
      (out) => {
        pendingCalloutPromise = triggerImpactFeedback(out);
      }
    );
  },

  'toggle-sound': () => {
    const isMuted = sfx.toggleMute();
    requestRender();
    toast(isMuted ? '🔇 音声をミュートしました' : '🔊 音声をオンにしました（甲子園効果音）');
  },

  'toggle-form-editor': () => {
    isFormEditorOpen = !isFormEditorOpen;
    if (isFormEditorOpen) {
      syncDevPitcherToLiveMatch();
    }
    requestRender();
  },

  'toggle-pitch-easing': () => {
    const nextState = !isRealisticPitchEasingActive;
    setRealisticPitchEasing(nextState);
    if (match3d) {
      match3d.setRealisticPitchEasing(nextState);
    }
    toast(
      nextState
        ? '🎬 投球モーションを「生体力学リアル緩急」に設定しました'
        : '🔄 投球モーションを「従来の等速直線（旧仕様）」に戻しました'
    );
    requestRender();
  },

  'set-dev-tab': (el: HTMLElement) => {
    const tab = el.getAttribute('data-tab') as DevModalTab;
    if (tab) {
      devModalActiveTab = tab;
      if (tab === 'BATTER_EDITOR') {
        match3d?.setCameraMode('BATTER_FOCUS_VIEW');
        match3d?.setBatterPhase(batterDemoPhase);
        match3d?.setBatterHandedness(batterDemoHandedness);
      } else if (tab === 'FORM_EDITOR') {
        match3d?.setCameraMode(demoCameraMode);
        match3d?.setPitcherPhase(demoPhase);
      }
      requestRender();
    }
  },

  'bb-set-cam': (el: HTMLElement) => {
    const cam = (el.getAttribute('data-cam') || 'BATTER_FOCUS_VIEW') as CameraViewMode;
    demoCameraMode = cam;
    match3d?.setCameraMode(cam);
    document.querySelectorAll('[data-act="bb-set-cam"]').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-cam') === cam;
      b.style.borderColor = isAct ? '#38bdf8' : '#475569';
      b.style.background = isAct ? '#0369a1' : '#0f172a';
    });
  },

  'bb-set-hands': (el: HTMLElement) => {
    const h = (el.getAttribute('data-hands') || 'R') as 'R' | 'L';
    batterDemoHandedness = h;
    match3d?.setBatterHandedness(h);
    document.querySelectorAll('[data-act="bb-set-hands"]').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-hands') === h;
      b.style.borderColor = isAct ? '#f59e0b' : '#475569';
      b.style.background = isAct ? '#78350f' : '#0f172a';
      b.style.color = isAct ? '#fef08a' : '#cbd5e1';
    });
  },

  'bb-step-phase': (el: HTMLElement) => {
    const p = parseFloat(el.getAttribute('data-phase') || '0');
    batterDemoPhase = p;
    match3d?.setBatterPhase(p);
    batterStageLabel = formatBatterStageLabel(p);
    const slider = document.getElementById('bb-scrub-slider') as HTMLInputElement | null;
    const label = document.getElementById('bb-phase-label');
    const val = document.getElementById('bb-slider-val');
    if (slider) slider.value = String(p);
    if (label) label.textContent = batterStageLabel;
    if (val) val.textContent = `${(p * 100).toFixed(0)}% (Frame ${Math.round(p * 95)})`;
  },

  'bb-play-motion': (el: HTMLElement) => {
    if (!match3d) return;
    const sp = parseFloat(el.getAttribute('data-speed') || '1.0');
    const slider = document.getElementById('bb-scrub-slider') as HTMLInputElement | null;
    const label = document.getElementById('bb-phase-label');
    const val = document.getElementById('bb-slider-val');

    match3d.playBatterSwingPreview(
      sp,
      (p) => {
        batterDemoPhase = p;
        if (slider) slider.value = String(p);
        const lbl = formatBatterStageLabel(p);
        if (label) label.textContent = lbl;
        if (val) val.textContent = `${(p * 100).toFixed(0)}% (Frame ${Math.round(p * 95)})`;
      },
      () => {
        // 再生完了
      }
    );
  },

  'apply-pitcher-preset': (el: HTMLElement) => {
    const preset = el.getAttribute('data-preset');
    if (preset === 'BALANCED') {
      devPitcherParams = { arm: 50, form: 50, control: 50, breaking: 50, stamina: 50, guts: 50, condition: 0, throws: 'R' };
    } else if (preset === 'ACE') {
      devPitcherParams = { arm: 85, form: 80, control: 75, breaking: 75, stamina: 80, guts: 75, condition: 2, throws: 'R' };
    } else if (preset === 'WILD') {
      devPitcherParams = { arm: 95, form: 85, control: 20, breaking: 30, stamina: 65, guts: 80, condition: 0, throws: 'R' };
    } else if (preset === 'CRAFTY') {
      devPitcherParams = { arm: 40, form: 45, control: 85, breaking: 80, stamina: 70, guts: 65, condition: 1, throws: 'L' };
    }
    syncDevPitcherToLiveMatch();
    requestRender();
  },

  'toggle-dev-pitcher-throws': () => {
    devPitcherParams.throws = devPitcherParams.throws === 'R' ? 'L' : 'R';
    syncDevPitcherToLiveMatch();
    requestRender();
  },

  'run-9inn-simulation': () => {
    devSimResult = simulateNineInnings(devPitcherParams);
    requestRender();
  },

  'run-5inn-simulation': () => {
    devSimResult = simulateNineInnings(devPitcherParams);
    requestRender();
  },

  'run-10match-simulation': () => {
    devSimResult = simulateMultipleMatches(devPitcherParams, 10, 9);
    requestRender();
  },

  'test-callout': (btn: HTMLElement) => {
    const kind = (btn.getAttribute('data-kind') || 'STRIKEOUT') as CalloutKind;
    let sub = '';
    if (kind === 'STRIKEOUT') sub = '空振り三振！';
    else if (kind === 'WALK') sub = 'フォアボール！出塁';
    else if (kind === 'DEADBALL') sub = '死球で出塁！';
    else if (kind === 'HOMERUN') sub = '甲子園スタンド直撃 本塁打!!';
    else if (kind === 'HIT') sub = 'クリーンヒット!';
    calloutOverlay.showCallout(kind, { subText: sub });
    toast(`コールアウト「${kind}」をプレビュー再生中`);
  },

  'test-big-score': (btn: HTMLElement) => {
    const scoreType = btn.getAttribute('data-score-type') || 'pushout';
    const isPushOut = scoreType === 'pushout';
    const badgeText = isPushOut ? '押し出し得点！' : 'タイムリー得点！';
    const a = activeMatch ? activeMatch.teamA.name : '九工大';
    const b = activeMatch ? activeMatch.teamB.name : '翔青';
    const sA = activeMatch ? (activeMatch.scoreA || 1) : 1;
    const sB = activeMatch ? activeMatch.scoreB : 0;

    calloutOverlay.showBigScore({
      teamAName: a,
      teamBName: b,
      scoreA: sA,
      scoreB: sB,
      badgeText,
      durationMs: 2500,
    });
    toast(`特大スコア「${badgeText}」をプレビュー再生中`);
  },

  'pb-set-form': (el: HTMLElement) => {
    const form = (el.getAttribute('data-form') || 'OVERHAND_HIGH') as PitchingFormType;
    demoForm = form;
    match3d?.setPitcherForm(form);
    document.querySelectorAll('.pb-form-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-form') === form;
      b.style.borderColor = isAct ? '#f59e0b' : '#475569';
      b.style.background = isAct ? '#1e40af' : '#1e293b';
    });
  },

  'pb-set-cam': (el: HTMLElement) => {
    const cam = (el.getAttribute('data-cam') || 'PITCH_VIEW') as CameraViewMode;
    demoCameraMode = cam;
    match3d?.setCameraMode(cam);
    document.querySelectorAll('.pb-cam-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-cam') === cam;
      b.style.borderColor = isAct ? '#38bdf8' : '#475569';
      b.style.background = isAct ? '#0369a1' : '#1e293b';
    });
  },

  'pb-toggle-throws': () => {
    demoThrows = demoThrows === 'R' ? 'L' : 'R';
    match3d?.setPitcherThrows(demoThrows);
    const btn = document.getElementById('pb-throws-btn');
    if (btn) {
      btn.textContent = demoThrows === 'R' ? '右投 (右足軸)' : '左投 (左足軸)';
    }
  },

  'pb-step-phase': (el: HTMLElement) => {
    const p = parseFloat(el.getAttribute('data-phase') || '0');
    demoPhase = p;
    isAnimating = false;
    match3d?.setPitcherPhase(p);
    const slider = document.getElementById('pb-phase-slider') as HTMLInputElement | null;
    const label = document.getElementById('pb-phase-label');
    if (slider) slider.value = String(Math.round(p * 100));
    if (label) label.textContent = formatStageLabel(p);
  },

  'pb-play-motion': (el: HTMLElement) => {
    if (!match3d) return;
    const sp = parseFloat(el.getAttribute('data-speed') || '1.0');
    match3d.setPlaybackSpeed(sp);
    const slider = document.getElementById('pb-phase-slider') as HTMLInputElement | null;
    const label = document.getElementById('pb-phase-label');

    if (sp < 0.8) {
      // スロー連続モーション確認再生
      isAnimating = true;
      match3d.playContinuousFormPreview(
        (p, stg) => {
          demoPhase = p;
          if (slider) slider.value = String(Math.round(p * 100));
          if (label) label.textContent = `${stg} (${Math.round(p * 100)}%)`;
        },
        () => {
          isAnimating = false;
        }
      );
    } else {
      // 通常速度：白球リリース＋物理弾道まで再生
      isAnimating = true;
      match3d.playDemoPitch('FOUR_SEAM', false, () => {
        isAnimating = false;
      });
    }
  },

  'pb-reset-mods': () => {
    demoModifiers = {
      legLiftHeight: 1.0,
      pelvisSinkDepth: 1.0,
      armSlotOffsetDeg: 0,
      torsoTiltOffsetDeg: 0,
      strideLengthScale: 1.0,
    };
    match3d?.setPitcherModifiers(demoModifiers);
    const setSlider = (id: string, valId: string, val: number, txt: string) => {
      const s = document.getElementById(id) as HTMLInputElement | null;
      const l = document.getElementById(valId);
      if (s) s.value = String(val);
      if (l) l.textContent = txt;
    };
    setSlider('pb-mod-leg', 'pb-mod-leg-val', 100, '100%');
    setSlider('pb-mod-sink', 'pb-mod-sink-val', 100, '100%');
    setSlider('pb-mod-arm', 'pb-mod-arm-val', 0, '+0°');
    setSlider('pb-mod-tilt', 'pb-mod-tilt-val', 0, '+0°');
  },

  'pb-set-jersey': (el: HTMLElement) => {
    const num = parseInt(el.getAttribute('data-num') || '1', 10);
    demoJerseyNumber = num;
    applyDemoUniformPreset();
    document.querySelectorAll('.pb-num-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = parseInt(b.getAttribute('data-num') || '0', 10) === num;
      b.style.borderColor = isAct ? '#f59e0b' : '#475569';
      b.style.background = isAct ? '#1e40af' : '#0f172a';
    });
  },

  'pb-set-pattern': (el: HTMLElement) => {
    const pat = (el.getAttribute('data-pat') || 'ACCENT_LINE') as 'NORMAL' | 'PINSTRIPE' | 'ACCENT_LINE';
    demoUniformPattern = pat;
    applyDemoUniformPreset();
    document.querySelectorAll('.pb-pat-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-pat') === pat;
      b.style.borderColor = isAct ? '#f59e0b' : '#475569';
      b.style.background = isAct ? '#1e40af' : '#0f172a';
    });
  },

  'pb-set-color': (el: HTMLElement) => {
    const col = el.getAttribute('data-col') || 'SEIUN';
    demoColorPreset = col;
    applyDemoUniformPreset();
    document.querySelectorAll('.pb-col-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      const isAct = b.getAttribute('data-col') === col;
      b.style.borderColor = isAct ? '#f59e0b' : '#475569';
    });
  },

  'pb-toggle-mask': () => {
    demoColorMaskMode = !demoColorMaskMode;
    match3d?.setPitcherColorMaskMode(demoColorMaskMode);
    const btn = document.getElementById('pb-mask-btn');
    if (btn) {
      btn.style.borderColor = demoColorMaskMode ? '#ec4899' : '#64748b';
      btn.style.background = demoColorMaskMode ? '#831843' : '#0f172a';
      btn.textContent = `🎨 部位別カラーIDマスク表示 (R:帽 C:袖 G:上 B:下 M:靴下): ${demoColorMaskMode ? 'ON' : 'OFF'}`;
    }
  },

  'toggle-autoplay': () => {
    if (autoPlayTimer !== null) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
      toast('⏸️ 自動進行を一時停止しました');
    } else {
      if (activeMatch) activeMatch.autoPauseTrigger = null;
      const intervalMs = (1000 / (activeMatch?.speed ?? 1.5)) * 0.9;
      autoPlayTimer = window.setInterval(() => {
        if (!activeMatch || activeMatch.isGameOver || isAnimating) return;
        if (activeMatch.autoPauseTrigger && activeMatch.autoPauseEnabled) {
          clearInterval(autoPlayTimer!);
          autoPlayTimer = null;
          requestRender();
          toast('🚨 勝負所のため自動進行を一時停止しました');
          return;
        }
        actions['step-pitch'](document.body, new Event('click'));
      }, intervalMs);
      isTacticsDrawerOpen = false;
      toast(`⏩ 自動進行を開始しました（速度 ${activeMatch?.speed ?? 1.5}x）`);
    }
    requestRender();
  },

  'set-tactic': (el) => {
    if (!activeMatch) return;
    if ((el as HTMLButtonElement).disabled) return;
    const val = el.getAttribute('data-val') as OffenseTactic;
    activeMatch.offenseTactic = val;
    isTacticsDrawerOpen = false;
    requestRender();
    toast(
      val === 'NORMAL'
        ? '⚾ サインを解除し「通常打撃」に戻しました'
        : `⚔️ 作戦サイン「${OFFENSE_TACTIC_LABELS[val]}」を発令！（次の投球で発動）`,
    );
  },

  'set-shift': (el) => {
    if (!activeMatch) return;
    const val = el.getAttribute('data-val') as DefenseShift;
    activeMatch.defenseShift = val;
    isTacticsDrawerOpen = false;
    requestRender();
    toast(`🛡️ 守備シフトを「${DEFENSE_SHIFT_LABELS[val] || val}」に変更しました`);
  },

  'toggle-caution': () => {
    if (!activeMatch) return;
    activeMatch.defenseAlert = !activeMatch.defenseAlert;
    requestRender();
    toast(
      activeMatch.defenseAlert
        ? '🚨 走者警戒（クイック・盗塁阻止）をONにしました'
        : '走者警戒を解除しました',
    );
  },

  'intentional-walk': () => {
    if (!activeMatch) return;
    const outcome = issueIntentionalWalk(activeMatch);
    isTacticsDrawerOpen = false;
    requestRender();
    toast(outcome.description);
  },

  'send-msg': (el) => {
    if (!activeMatch) return;
    if ((el as HTMLButtonElement).disabled) return;
    const pitchingTeam = activeMatch.isBottom ? activeMatch.teamA : activeMatch.teamB;
    const ok = sendMessenger(activeMatch, pitchingTeam.id);
    isTacticsDrawerOpen = false;
    requestRender();
    if (document.querySelector('.sub-screen-card')) {
      openSubstitutionModal();
    }
    toast(
      ok
        ? `📣 伝令を送りました！投手のスタミナが回復しました（残${pitchingTeam.messagesLeft}回）`
        : '伝令の残り回数がありません',
    );
  },

  'set-speed': (el) => {
    if (!activeMatch) return;
    const sp = parseFloat(el.getAttribute('data-val') || '1.5') as 1.0 | 1.5 | 2.0;
    activeMatch.speed = sp;
    match3d?.setPlaybackSpeed(sp);
    if (autoPlayTimer !== null) {
      clearInterval(autoPlayTimer);
      const intervalMs = (1000 / sp) * 0.9;
      autoPlayTimer = window.setInterval(() => {
        if (!activeMatch || activeMatch.isGameOver || isAnimating) return;
        if (activeMatch.autoPauseTrigger && activeMatch.autoPauseEnabled) {
          clearInterval(autoPlayTimer!);
          autoPlayTimer = null;
          requestRender();
          return;
        }
        actions['step-pitch'](document.body, new Event('click'));
      }, intervalMs);
    }
    requestRender();
    toast(`⏱️ ゲーム進行速度を ${sp.toFixed(1)}x に設定しました`);
  },

  'open-sub-modal': () => {
    isTacticsDrawerOpen = false;
    selectedSubCandidateId = null;
    requestRender();
    openSubstitutionModal();
  },

  'select-sub-candidate': (el) => {
    const pid = el.getAttribute('data-id');
    if (!pid) return;
    selectedSubCandidateId = pid;
    openSubstitutionModal();
  },

  'open-box-score': () => {
    openBoxScoreModal();
  },

  'open-highlights': () => {
    openHighlightsModal();
  },

  'apply-pitcher-change': (el) => {
    if (!activeMatch) return;
    const pid = el.getAttribute('data-id');
    const myTeam = activeMatch.teamA.isPlayerTeam ? activeMatch.teamA : activeMatch.teamB;
    if (pid && changePitcher(activeMatch, myTeam.id, pid)) {
      toast(`⚾ 投手交代：${myTeam.pitcher.player.name.family} がマウンドに上がりました！`);
    }
    closeModal();
    requestRender();
  },

  'apply-pinch-hit': (el) => {
    if (!activeMatch) return;
    const pid = el.getAttribute('data-id');
    const myTeam = activeMatch.teamA.isPlayerTeam ? activeMatch.teamA : activeMatch.teamB;
    const orderIdx = myTeam.currentBatterIndex % myTeam.lineup.length;
    if (pid && pinchHit(activeMatch, myTeam.id, orderIdx, pid)) {
      const newBatter = myTeam.lineup[orderIdx];
      toast(`⚔️ 代打起用：${orderIdx + 1}番に ${newBatter.name.family} を送りました！`);
    }
    closeModal();
    requestRender();
  },

  'finish-match': () => {
    closeModal();
    if (match3d) {
      match3d.dispose();
      match3d = null;
    }
    const s = game();
    for (const p of s.roster) {
      p.abilities.guts = Math.min(100, p.abilities.guts + 2);
    }
    touch();
    activeMatch = null;
    matchScreenState = 'PRE_ORDER';
    go('main');
  },
});
