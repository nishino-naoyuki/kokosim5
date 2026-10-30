import { pitchVelocity } from '../core/abilities';
import { clamp, Rng } from '../core/rng';
import type { Handedness, Player } from '../core/types';
import type { StadiumSpec } from '../render/stadium';
import type {
  BatterBoxScore,
  LiveBases,
  LiveMatchState,
  LivePitcherState,
  LiveTeam,
  OffenseTactic,
  PitchOutcome,
  PitcherBoxScore,
  TrackingStats,
} from './types';

export interface CreateMatchConfig {
  matchId: string;
  tournamentTitle: string;
  roundName: string;
  stadium: StadiumSpec;
  teamA: {
    id: string;
    name: string;
    prefecture: string;
    isPlayerTeam: boolean;
    roster: Player[];
    uniform: {
      capColor: string;
      shirtColor: string;
      pantsColor: string;
      underShirtColor: string;
    };
  };
  teamB: {
    id: string;
    name: string;
    prefecture: string;
    isPlayerTeam: boolean;
    roster: Player[];
    uniform: {
      capColor: string;
      shirtColor: string;
      pantsColor: string;
      underShirtColor: string;
    };
  };
}

/** 初期チーム実戦オブジェクトの構築 */
function setupLiveTeam(cfg: CreateMatchConfig['teamA']): LiveTeam {
  const healthy = cfg.roster.filter((p) => !p.injury);
  const pitchers = healthy
    .filter((p) => p.position === 'P')
    .sort((a, b) => b.abilities.control + b.abilities.arm - (a.abilities.control + a.abilities.arm));
  const fielders = healthy.filter((p) => p.position !== 'P');

  while (pitchers.length < 2 && fielders.length > 9) {
    pitchers.push(fielders.pop()!);
  }

  const batterScore = (p: Player) =>
    p.abilities.contact * 0.35 + p.abilities.power * 0.3 + p.abilities.speed * 0.15 + p.abilities.eye * 0.1 + p.abilities.guts * 0.1;
  const sorted = fielders.slice().sort((a, b) => batterScore(b) - batterScore(a));

  // 1〜9番の打順割り当て
  const lineup: Player[] = [];
  const slots = [3, 0, 1, 2, 4, 5, 6, 7, 8];
  for (const idx of slots) {
    if (sorted[idx]) lineup.push(sorted[idx]);
  }
  while (lineup.length < 9 && fielders[lineup.length]) {
    lineup.push(fielders[lineup.length]);
  }
  while (lineup.length < 9 && healthy[lineup.length]) {
    lineup.push(healthy[lineup.length]);
  }

  const primaryPitcher = pitchers[0] ?? lineup[0];
  const maxStamina = 70 + primaryPitcher.abilities.stamina * 0.8;
  const livePitcher: LivePitcherState = {
    player: primaryPitcher,
    pitches: 0,
    stamina: maxStamina,
    maxStamina,
    earnedRuns: 0,
    hitsAllowed: 0,
    strikeouts: 0,
    walks: 0,
  };

  const used = new Set([primaryPitcher.id, ...lineup.map((p) => p.id)]);
  const bench = cfg.roster.filter((p) => !used.has(p.id) && !p.injury);
  const bullpen = pitchers.filter((p) => p.id !== primaryPitcher.id);

  const batterHistory: Record<string, ('HIT' | 'OUT' | 'BB' | 'HR' | '2B' | '3B' | 'ERR')[]> = {};
  for (const p of lineup) batterHistory[p.id] = [];

  return {
    id: cfg.id,
    name: cfg.name,
    prefecture: cfg.prefecture,
    isPlayerTeam: cfg.isPlayerTeam,
    capColor: cfg.uniform.capColor,
    shirtColor: cfg.uniform.shirtColor,
    pantsColor: cfg.uniform.pantsColor,
    underShirtColor: cfg.uniform.underShirtColor,
    lineup,
    lineupPositions: lineup.map((p) => p.position),
    bench,
    pitcher: livePitcher,
    pitcherIndex: 0,
    bullpen,
    currentBatterIndex: 0,
    batterHistory,
    messagesLeft: 3,
  };
}

/** 初期ボックススコア構築 */
function initBoxScores(team: LiveTeam): Record<string, BatterBoxScore> {
  const box: Record<string, BatterBoxScore> = {};
  team.lineup.forEach((p, idx) => {
    box[p.id] = {
      playerId: p.id,
      name: `${p.name.family} ${p.name.given}`,
      position: p.position,
      orderNumber: idx + 1,
      atBats: 0,
      runs: 0,
      hits: 0,
      rbi: 0,
      strikeouts: 0,
      walks: 0,
      homeRuns: 0,
    };
  });
  return box;
}

function initPitcherBox(team: LiveTeam): Record<string, PitcherBoxScore> {
  const p = team.pitcher.player;
  return {
    [p.id]: {
      playerId: p.id,
      name: `${p.name.family} ${p.name.given}`,
      inningsPitched: 0,
      hits: 0,
      runs: 0,
      earnedRuns: 0,
      walks: 0,
      strikeouts: 0,
      pitches: 0,
    },
  };
}

/**
 * リアルタイム試合インスタンス生成
 */
export function createLiveMatch(cfg: CreateMatchConfig): LiveMatchState {
  const teamA = setupLiveTeam(cfg.teamA);
  const teamB = setupLiveTeam(cfg.teamB);

  return {
    matchId: cfg.matchId,
    tournamentTitle: cfg.tournamentTitle,
    roundName: cfg.roundName,
    stadium: cfg.stadium,
    teamA,
    teamB,
    inning: 1,
    isBottom: false,
    outs: 0,
    balls: 0,
    strikes: 0,
    scoreA: 0,
    scoreB: 0,
    lineScoreA: [0],
    lineScoreB: [],
    hitsA: 0,
    hitsB: 0,
    errorsA: 0,
    errorsB: 0,
    bases: { b1: null, b2: null, b3: null },
    offenseTactic: 'NORMAL',
    defenseShift: 'NORMAL',
    defenseAlert: false,
    lastPitch: null,
    speed: 1.5,
    autoPauseEnabled: true,
    autoPauseTrigger: null,
    isGameOver: false,
    winnerTeamId: null,
    boxScoreA: initBoxScores(teamA),
    boxScoreB: initBoxScores(teamB),
    pitcherBoxA: initPitcherBox(teamA),
    pitcherBoxB: initPitcherBox(teamB),
    playLog: [`⚾ プレイボール！ [${cfg.tournamentTitle} - ${cfg.roundName}]`],
  };
}

// ---------------------------------------------------------------------------
// 1球采配・シミュレーション進行エンジン
// ---------------------------------------------------------------------------

/** 球種決定 */
function pickPitchType(pitcher: Player, count: { balls: number; strikes: number }, rng: Rng): string {
  const types = ['ストレート'];
  if (pitcher.abilities.breaking >= 40) types.push('スライダー');
  if (pitcher.abilities.breaking >= 55) types.push('カーブ');
  if (pitcher.abilities.breaking >= 65) types.push('フォーク');
  if (pitcher.abilities.control >= 60) types.push('チェンジアップ');

  // 追い込んだら決め球（フォーク・スライダー）
  if (count.strikes === 2 && types.length > 1) {
    return rng.chance(0.65) ? types[types.length - 1] : types[0];
  }
  return rng.pick(types);
}

/**
 * 1球投球・判定処理
 */
export function stepPitch(state: LiveMatchState, rng: Rng): PitchOutcome {
  if (state.isGameOver) {
    return {
      pitchType: 'ストレート',
      speedKmh: 140,
      ballResult: 'IN_PLAY',
      runsScored: 0,
      outsAdded: 0,
      description: '試合終了',
      tracking: { pitchType: 'ストレート', pitchSpeedKmh: 140, pitchZone: 'CENTER' },
    };
  }

  const battingTeam = state.isBottom ? state.teamB : state.teamA;
  const pitchingTeam = state.isBottom ? state.teamA : state.teamB;
  const batter = battingTeam.lineup[battingTeam.currentBatterIndex % battingTeam.lineup.length];
  const pitcherState = pitchingTeam.pitcher;
  const pitcher = pitcherState.player;

  const count = { balls: state.balls, strikes: state.strikes };
  const pitchType = pickPitchType(pitcher, count, rng);

  // 基礎球速（疲労・スタミナ減退補正）
  const baseV = pitchVelocity(pitcher.abilities.arm, pitcher.abilities.form, pitcher.traits);
  const staminaRatio = Math.max(0.2, pitcherState.stamina / pitcherState.maxStamina);
  const fatigueSpeedPenalty = (1 - staminaRatio) * 6.5;
  const quickPenalty = state.defenseAlert ? 2.0 : 0;
  const speedKmh = Math.round(
    baseV - fatigueSpeedPenalty - quickPenalty + (pitchType === 'ストレート' ? rng.float(-2, 3) : rng.float(-10, -5)),
  );

  // コース判定（ストライクゾーン vs ボールゾーン）
  // 高校野球の平均打者相手に、9回（27アウト）で ctrl=0で約10四球、ctrl=50で約3.5〜4四球、ctrl=100で約1.5四球となるバランス
  const ctrl = pitcher.abilities.control;
  const strikeProbability = clamp(0.585 + (ctrl - 50) * 0.0022 - (1 - staminaRatio) * 0.12, 0.44, 0.66);
  const inStrikeZone = rng.chance(strikeProbability);
  const zone: TrackingStats['pitchZone'] = inStrikeZone
    ? rng.pick(['CENTER', 'HIGH_IN', 'HIGH_OUT', 'LOW_IN', 'LOW_OUT'])
    : 'BALL';

  // 投球数・スタミナ消費
  pitcherState.pitches++;
  pitcherState.stamina = Math.max(0, pitcherState.stamina - (state.defenseAlert ? 1.15 : 1.0));

  // 投手ボックススコアの更新
  const pBox = state.isBottom ? state.pitcherBoxA : state.pitcherBoxB;
  if (!pBox[pitcher.id]) {
    pBox[pitcher.id] = {
      playerId: pitcher.id,
      name: `${pitcher.name.family} ${pitcher.name.given}`,
      inningsPitched: 0,
      hits: 0,
      runs: 0,
      earnedRuns: 0,
      walks: 0,
      strikeouts: 0,
      pitches: 0,
    };
  }
  pBox[pitcher.id].pitches = pitcherState.pitches;

  // -------------------------------------------------------------------------
  // 申告敬遠
  // -------------------------------------------------------------------------
  if (state.offenseTactic !== 'NORMAL' && (state.defenseShift as string) === 'INTENTIONAL_WALK') {
    const outcome = handleWalk(state, batter, battingTeam, pBox[pitcher.id], '申告敬遠');
    state.defenseShift = 'NORMAL';
    return outcome;
  }

  // -------------------------------------------------------------------------
  // 盗塁判定（走者警戒・盗塁コマンド）
  // -------------------------------------------------------------------------
  if (state.offenseTactic === 'STEAL' && (state.bases.b1 || state.bases.b2)) {
    state.offenseTactic = 'NORMAL';
    const stealOutcome = handleSteal(state, battingTeam, pitchingTeam, rng);
    if (stealOutcome) return stealOutcome;
  }

  // -------------------------------------------------------------------------
  // スイング判断（打者の選球眼 × 投手の制球力 × カウント進行）
  // -------------------------------------------------------------------------
  const batterEye = batter.abilities.eye ?? 50;
  // コントロールが高いほどボール球がゾーン際どいコースに外れ、低いほど大きく外れる
  const ballSharpness = (ctrl - 50) * 0.0014;
  // 打者の選球眼（eye）が良いほどボール球に手を出さず、悪い（悪球打ち）ほど振ってしまう
  const eyeFactor = (50 - batterEye) * 0.0030;
  // カウントに応じた選球補正（3ボール時は見極め、2ストライク時はカット・警戒）
  const countBallSwingBonus = count.balls === 3 ? -0.14 : count.strikes === 2 ? 0.10 : 0;
  const baseBallSwingProb = clamp(0.22 + ballSharpness + eyeFactor + countBallSwingBonus, 0.06, 0.40);

  let swingProb = inStrikeZone
    ? clamp(
        0.67 +
          (batterEye - 50) * 0.002 +
          (count.strikes === 2 ? 0.12 : 0) -
          (count.balls === 3 && count.strikes === 0 ? 0.35 : 0),
        0.30,
        0.90,
      )
    : baseBallSwingProb;
  const tactic = state.offenseTactic;

  if (tactic === 'PATIENCE') {
    swingProb = 0.0; // 待球
  } else if (tactic === 'AGGRESSIVE' && count.balls === 0 && count.strikes === 0) {
    swingProb = inStrikeZone ? 0.95 : 0.45; // 積極打法・初球
  } else if (tactic === 'LOW_BALL' && (zone === 'LOW_IN' || zone === 'LOW_OUT' || zone === 'BALL')) {
    swingProb *= 0.4;
  } else if (tactic === 'HIGH_BALL' && (zone === 'HIGH_IN' || zone === 'HIGH_OUT')) {
    swingProb *= 0.4;
  } else if (tactic === 'BUNT' || tactic === 'SQUEEZE') {
    swingProb = inStrikeZone || rng.chance(0.6) ? 0.92 : 0.3;
  }

  const swings = rng.chance(swingProb);

  // 1. スイングなし（見逃し）
  if (!swings) {
    if (inStrikeZone) {
      state.strikes++;
      if (state.strikes >= 3) {
        return handleStrikeout(state, batter, battingTeam, pBox[pitcher.id], '見逃し三振！');
      }
      return makePitchResult(pitchType, speedKmh, 'CALLED_STRIKE', 0, 0, `見逃しストライク！（${state.balls}B-${state.strikes}S）`, {
        pitchType,
        pitchSpeedKmh: speedKmh,
        pitchZone: zone,
      });
    } else {
      // デッドボール（死球）判定
      // 制球力（ctrl: 0〜100）が低いほど、またスタミナ切れ・不調時にすっぽ抜けが発生
      const deadBallProb = clamp(
        0.0035 + (50 - ctrl) * 0.00025 + (1 - staminaRatio) * 0.003 - pitcher.condition * 0.0004,
        0.0005,
        0.025,
      );
      if (rng.chance(deadBallProb)) {
        return handleDeadBall(state, batter, battingTeam, pBox[pitcher.id], pitchType, speedKmh, 'デッドボール（死球）！出塁');
      }

      state.balls++;
      if (state.balls >= 4) {
        return handleWalk(state, batter, battingTeam, pBox[pitcher.id], '四球で歩く！');
      }
      return makePitchResult(pitchType, speedKmh, 'BALL', 0, 0, `ボール！（${state.balls}B-${state.strikes}S）`, {
        pitchType,
        pitchSpeedKmh: speedKmh,
        pitchZone: zone,
      });
    }
  }

  // 2. スイングあり（コンタクト判定）
  const batterContact = batter.abilities.contact + (tactic === 'CONTACT' ? 25 : 0) - (tactic === 'POWER' ? 18 : 0);
  const pitcherStuff = (ctrl + pitcher.abilities.breaking) / 2 + (pitchType !== 'ストレート' ? 10 : 0);
  const contactProb = clamp(0.72 + (batterContact - pitcherStuff) * 0.003 - (zone === 'BALL' ? 0.28 : 0), 0.35, 0.94);

  if (!rng.chance(contactProb)) {
    // 空振り
    state.strikes++;
    if (state.strikes >= 3) {
      return handleStrikeout(state, batter, battingTeam, pBox[pitcher.id], '空振り三振！');
    }
    return makePitchResult(pitchType, speedKmh, 'SWINGING_STRIKE', 0, 0, `空振りストライク！（${state.balls}B-${state.strikes}S）`, {
      pitchType,
      pitchSpeedKmh: speedKmh,
      pitchZone: zone,
    });
  }

  // 3. バットに当たった（ファウル vs インプレー）
  const isFoul = rng.chance(0.38);
  if (isFoul) {
    if (state.strikes < 2) state.strikes++;
    return makePitchResult(pitchType, speedKmh, 'FOUL', 0, 0, `ファウルボール！（${state.balls}B-${state.strikes}S）`, {
      pitchType,
      pitchSpeedKmh: speedKmh,
      pitchZone: zone,
      exitVelocityKmh: Math.round(speedKmh * 0.85),
      launchAngleDeg: 40,
      trajectoryType: 'FLY',
    });
  }

  // 4. インプレー打球発生！
  return resolveInPlay(state, batter, battingTeam, pitchingTeam, pitchType, speedKmh, zone, tactic, rng);
}

// ---------------------------------------------------------------------------
// インプレー打球処理
// ---------------------------------------------------------------------------

function resolveInPlay(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  pitchingTeam: LiveTeam,
  pitchType: string,
  speedKmh: number,
  zone: TrackingStats['pitchZone'],
  tactic: OffenseTactic,
  rng: Rng,
): PitchOutcome {
  // カウントリセット
  state.balls = 0;
  state.strikes = 0;

  // ボックススコア打数+1
  const bBox = (state.isBottom ? state.boxScoreB : state.boxScoreA)[batter.id];
  if (bBox) bBox.atBats++;

  // バント処理
  if (tactic === 'BUNT' || tactic === 'SQUEEZE') {
    return resolveBunt(state, batter, battingTeam, pitchingTeam, tactic, rng);
  }

  // 打球初速（Exit Velocity）と角度（Launch Angle）
  const powerBonus = tactic === 'POWER' ? 1.1 : 1.0;
  const exitV = Math.round(
    (110 + batter.abilities.power * 0.55 + rng.float(-8, 12)) * powerBonus,
  );
  const launchAngle = Math.round(
    (tactic === 'POWER' ? rng.float(18, 38) : rng.float(-5, 32)),
  );

  const tracking: TrackingStats = {
    pitchType,
    pitchSpeedKmh: speedKmh,
    pitchZone: zone,
    exitVelocityKmh: exitV,
    launchAngleDeg: launchAngle,
    trajectoryType: launchAngle < 10 ? 'GROUNDER' : launchAngle < 24 ? 'LINER' : 'FLY',
  };

  // 球場フェンス距離と長打判定
  const stadium = state.stadium;
  const pHR = clamp((batter.abilities.power - 50) * 0.003 + (exitV - 140) * 0.005 + (launchAngle >= 25 && launchAngle <= 35 ? 0.08 : 0), 0.01, 0.35);

  let inPlayOutcome: PitchOutcome['inPlayOutcome'] = 'GROUNDOUT';
  let desc = '';
  let runsScored = 0;
  let outsAdded = 0;

  if (launchAngle >= 22 && rng.chance(pHR)) {
    // 本塁打（ホームラン！）
    inPlayOutcome = 'HR';
    tracking.trajectoryType = 'HOMERUN';
    tracking.hitDistanceMeters = Math.round(stadium.foulLine + rng.float(5, 18));
    runsScored = 1 + countRunners(state.bases);
    desc = `大歓声！${batter.name.family}の放った打球は高々とスタンドに突き刺さる特大ホームラン！（+${runsScored}点）`;
    recordHit(state, batter, battingTeam, pitchingTeam, 'HR', runsScored);
    state.bases = { b1: null, b2: null, b3: null };
  } else if (exitV >= 145 && launchAngle >= 15 && rng.chance(state.defenseShift === 'DEEP_OUTFIELD' ? 0.14 : 0.28)) {
    // 二塁打・三塁打（長打：外野深めシフト時は頭上越え確率半減）
    const is3B = batter.abilities.speed >= 75 && rng.chance(0.2);
    inPlayOutcome = is3B ? '3B' : '2B';
    const adv = advanceBasesOnExtraBaseHit(state.bases, batter, is3B ? 3 : 2);
    runsScored = adv.runs;
    desc = is3B
      ? `右中間を真っ二つ！快足を飛ばして三塁打！（+${runsScored}点）`
      : `左中間フェンス直撃の痛烈なツーベースヒット！（+${runsScored}点）`;
    recordHit(state, batter, battingTeam, pitchingTeam, is3B ? '3B' : '2B', runsScored);
  } else if (
    rng.chance(
      0.32 +
        (batter.abilities.contact - 50) * 0.002 +
        (state.defenseShift === 'FORWARD' ? 0.06 : 0) +
        (state.defenseShift === 'BUNT_DEFENSE' ? 0.1 : 0) +
        (state.defenseShift === 'DEEP_OUTFIELD' ? 0.05 : 0),
    )
  ) {
    // 単打（クリーンヒット：前進・バント警戒時は内野を抜けるリスク増、外野深め時はポテンヒット増）
    inPlayOutcome = '1B';
    const adv = advanceBasesOnSingle(state.bases, batter, rng);
    runsScored = adv.runs;
    desc = `センター前へ弾き返すクリーンヒット！（+${runsScored}点）`;
    recordHit(state, batter, battingTeam, pitchingTeam, '1B', runsScored);
  } else if (rng.chance(0.04)) {
    // 失策（エラー）
    inPlayOutcome = 'ERROR';
    if (state.isBottom) state.errorsA++;
    else state.errorsB++;
    const adv = advanceBasesOnError(state.bases, batter);
    runsScored = adv.runs;
    desc = `打球をファンブル！守備陣の痛恨のエラー！（+${runsScored}点）`;
    recordError(battingTeam, batter);
  } else {
    // 凡退（ゴロ・フライ・ライナー・併殺）
    const isDP = state.bases.b1 && state.outs < 2 && launchAngle < 10 && (state.defenseShift === 'DOUBLE_PLAY' || rng.chance(0.25));
    if (isDP) {
      inPlayOutcome = 'DOUBLE_PLAY';
      outsAdded = 2;
      state.outs += 2;
      state.bases.b1 = null;
      desc = `ショート正面のゴロ！6-4-3と転送されて痛恨のダブルプレー！`;
      recordOut(battingTeam, batter);
    } else {
      outsAdded = 1;
      state.outs++;
      inPlayOutcome = launchAngle < 10 ? 'GROUNDOUT' : 'FLYOUT';
      // 犠牲フライ判定（3塁走者生還）
      if (state.outs < 3 && state.bases.b3 && launchAngle >= 25 && rng.chance(0.45)) {
        runsScored = 1;
        state.bases.b3 = null;
        desc = `外野深遠へのフライ！三塁走者がタッチアップして生還！（+1点）`;
      } else {
        desc = inPlayOutcome === 'GROUNDOUT' ? `内野ゴロに倒れる。` : `高々と打ち上げて外野フライ。`;
      }
      recordOut(battingTeam, batter);
    }
  }

  // 得点加算
  if (runsScored > 0) {
    if (state.isBottom) state.scoreB += runsScored;
    else state.scoreA += runsScored;
    const curLine = state.isBottom ? state.lineScoreB : state.lineScoreA;
    curLine[curLine.length - 1] = (curLine[curLine.length - 1] ?? 0) + runsScored;
  }

  // 3アウトチェンジまたは次の打者へ
  checkInningProgress(state, runsScored);

  // Auto-Pauseトリガー評価
  evaluateAutoPause(state);

  const res = makePitchResult(pitchType, speedKmh, 'IN_PLAY', runsScored, outsAdded, desc, tracking);
  res.inPlayOutcome = inPlayOutcome;
  state.lastPitch = res;
  state.offenseTactic = 'NORMAL';
  return res;
}

// ---------------------------------------------------------------------------
// バント処理
// ---------------------------------------------------------------------------

function resolveBunt(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  _pitchingTeam: LiveTeam,
  tactic: 'BUNT' | 'SQUEEZE',
  rng: Rng,
): PitchOutcome {
  let runsScored = 0;
  let outsAdded = 1;
  state.outs++;

  let desc = '';
  let outcomeType: PitchOutcome['inPlayOutcome'] = 'SAC_BUNT';

  if (state.defenseShift === 'BUNT_DEFENSE' && rng.chance(0.6)) {
    // バント警戒シフト成功！猛チャージで先行走者を封殺
    outcomeType = 'GROUNDOUT';
    if (tactic === 'SQUEEZE' && state.bases.b3) {
      state.bases.b3 = null;
      state.bases.b1 = batter;
      desc = `バント警戒網が炸裂！猛チャージから本塁タッチアウトでスクイズ阻止！`;
    } else if (state.bases.b1) {
      // 二塁（または三塁）封殺で進塁阻止、打者走者が一塁残塁
      if (state.bases.b2) {
        state.bases.b2 = state.bases.b1;
      }
      state.bases.b1 = batter;
      desc = `一・三塁手が猛チャージ！素早い送球で先行走者を封殺しバント阻止！`;
    } else {
      desc = `バント警戒の前進守備で素早く処理し一塁アウト！`;
    }
  } else if (tactic === 'SQUEEZE' && state.bases.b3) {
    runsScored = 1;
    state.bases.b3 = null;
    desc = `見事なスクイズ成功！三塁走者が生還して貴重な1点をもぎ取る！`;
  } else {
    // 送りバント（全走者1つ進塁）
    if (state.bases.b2) { state.bases.b3 = state.bases.b2; state.bases.b2 = null; }
    if (state.bases.b1) { state.bases.b2 = state.bases.b1; state.bases.b1 = null; }
    desc = `一塁線へ手堅く転がして送りバント成功！走者を確実に進塁させる。`;
  }

  if (runsScored > 0) {
    if (state.isBottom) state.scoreB += runsScored;
    else state.scoreA += runsScored;
    const curLine = state.isBottom ? state.lineScoreB : state.lineScoreA;
    curLine[curLine.length - 1] = (curLine[curLine.length - 1] ?? 0) + runsScored;
  }

  recordOut(battingTeam, batter);
  checkInningProgress(state, runsScored);
  evaluateAutoPause(state);

  const res = makePitchResult('ストレート', 135, 'IN_PLAY', runsScored, outsAdded, desc, {
    pitchType: 'ストレート',
    pitchSpeedKmh: 135,
    pitchZone: 'CENTER',
    exitVelocityKmh: 75,
    launchAngleDeg: -2,
    trajectoryType: 'GROUNDER',
  });
  res.inPlayOutcome = outcomeType;
  state.lastPitch = res;
  state.offenseTactic = 'NORMAL';
  return res;
}

// ---------------------------------------------------------------------------
// 盗塁処理
// ---------------------------------------------------------------------------

function handleSteal(
  state: LiveMatchState,
  _battingTeam: LiveTeam,
  pitchingTeam: LiveTeam,
  rng: Rng,
): PitchOutcome | null {
  const runner = state.bases.b1 || state.bases.b2;
  if (!runner) return null;

  const runnerSpeed = runner.abilities.speed;
  const catcherArm = pitchingTeam.lineup.find((p) => p.position === 'C')?.abilities.arm ?? 60;
  const alertPenalty = state.defenseAlert ? 0.35 : 0;
  const stealSuccessProb = clamp(0.55 + (runnerSpeed - catcherArm) * 0.006 - alertPenalty, 0.15, 0.9);

  if (rng.chance(stealSuccessProb)) {
    if (state.bases.b2 && !state.bases.b3) {
      state.bases.b3 = state.bases.b2;
      state.bases.b2 = null;
    } else if (state.bases.b1 && !state.bases.b2) {
      state.bases.b2 = state.bases.b1;
      state.bases.b1 = null;
    }
    const desc = `スタートを切った！快速を飛ばしてスチール成功！`;
    return makePitchResult('ストレート', 140, 'BALL', 0, 0, desc, {
      pitchType: 'ストレート',
      pitchSpeedKmh: 140,
      pitchZone: 'CENTER',
    });
  } else {
    state.outs++;
    if (state.bases.b2) state.bases.b2 = null;
    else if (state.bases.b1) state.bases.b1 = null;
    const desc = `捕手からの矢のような送球！間一髪タッチアウト（盗塁死）！`;
    checkInningProgress(state, 0);
    evaluateAutoPause(state);
    return makePitchResult('ストレート', 140, 'BALL', 0, 1, desc, {
      pitchType: 'ストレート',
      pitchSpeedKmh: 140,
      pitchZone: 'CENTER',
    });
  }
}

// ---------------------------------------------------------------------------
// 走者進塁ヘルパー
// ---------------------------------------------------------------------------

function countRunners(bases: LiveBases): number {
  return [bases.b1, bases.b2, bases.b3].filter(Boolean).length;
}

function advanceBasesOnSingle(bases: LiveBases, batter: Player, rng: Rng): { runs: number } {
  let runs = 0;
  if (bases.b3) runs++;
  if (bases.b2) {
    if (rng.chance(0.65)) runs++;
    else bases.b3 = bases.b2;
  }
  if (bases.b1) {
    if (!bases.b3 && rng.chance(0.35)) bases.b3 = bases.b1;
    else bases.b2 = bases.b1;
  }
  bases.b1 = batter;
  return { runs };
}

function advanceBasesOnExtraBaseHit(bases: LiveBases, batter: Player, baseNum: 2 | 3): { runs: number } {
  let runs = 0;
  if (bases.b3) runs++;
  if (bases.b2) runs++;
  if (bases.b1) {
    if (baseNum === 3 || bases.b1.abilities.speed >= 65) runs++;
    else bases.b3 = bases.b1;
  }
  bases.b1 = null;
  if (baseNum === 3) {
    bases.b2 = null;
    bases.b3 = batter;
  } else {
    bases.b2 = batter;
    if (bases.b3 === batter) bases.b3 = null;
  }
  return { runs };
}

function advanceBasesOnError(bases: LiveBases, batter: Player): { runs: number } {
  let runs = 0;
  if (bases.b3) runs++;
  bases.b3 = bases.b2;
  bases.b2 = bases.b1;
  bases.b1 = batter;
  return { runs };
}

// ---------------------------------------------------------------------------
// 打席結果記録
// ---------------------------------------------------------------------------

function recordHit(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  pitchingTeam: LiveTeam,
  kind: '1B' | '2B' | '3B' | 'HR',
  rbi: number,
): void {
  if (state.isBottom) state.hitsB++;
  else state.hitsA++;

  battingTeam.batterHistory[batter.id] = battingTeam.batterHistory[batter.id] || [];
  const tile: 'HIT' | 'HR' | '2B' | '3B' = kind === '1B' ? 'HIT' : kind;
  battingTeam.batterHistory[batter.id].push(tile);

  const bBox = (state.isBottom ? state.boxScoreB : state.boxScoreA)[batter.id];
  if (bBox) {
    bBox.hits++;
    bBox.rbi += rbi;
    if (kind === 'HR') bBox.homeRuns++;
  }

  pitchingTeam.pitcher.hitsAllowed++;
  battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % battingTeam.lineup.length;
}

function recordOut(battingTeam: LiveTeam, batter: Player): void {
  battingTeam.batterHistory[batter.id] = battingTeam.batterHistory[batter.id] || [];
  battingTeam.batterHistory[batter.id].push('OUT');
  battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % battingTeam.lineup.length;
}

function recordError(battingTeam: LiveTeam, batter: Player): void {
  battingTeam.batterHistory[batter.id] = battingTeam.batterHistory[batter.id] || [];
  battingTeam.batterHistory[batter.id].push('ERR');
  battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % battingTeam.lineup.length;
}

function handleStrikeout(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  pBox: PitcherBoxScore,
  desc: string,
): PitchOutcome {
  state.outs++;
  state.balls = 0;
  state.strikes = 0;
  pBox.strikeouts++;

  const bBox = (state.isBottom ? state.boxScoreB : state.boxScoreA)[batter.id];
  if (bBox) {
    bBox.atBats++;
    bBox.strikeouts++;
  }
  recordOut(battingTeam, batter);
  checkInningProgress(state, 0);
  evaluateAutoPause(state);

  const res = makePitchResult('ストレート', 142, 'SWINGING_STRIKE', 0, 1, desc, {
    pitchType: 'ストレート',
    pitchSpeedKmh: 142,
    pitchZone: 'LOW_OUT',
  });
  state.lastPitch = res;
  return res;
}

function handleWalk(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  pBox: PitcherBoxScore,
  desc: string,
): PitchOutcome {
  state.balls = 0;
  state.strikes = 0;
  pBox.walks++;

  const bBox = (state.isBottom ? state.boxScoreB : state.boxScoreA)[batter.id];
  if (bBox) bBox.walks++;

  // 押し出し判定
  let runs = 0;
  if (state.bases.b1 && state.bases.b2 && state.bases.b3) {
    runs = 1;
    if (state.isBottom) state.scoreB++;
    else state.scoreA++;
    const curLine = state.isBottom ? state.lineScoreB : state.lineScoreA;
    curLine[curLine.length - 1] = (curLine[curLine.length - 1] ?? 0) + 1;
  }
  if (state.bases.b1 && state.bases.b2) state.bases.b3 = state.bases.b2;
  if (state.bases.b1) state.bases.b2 = state.bases.b1;
  state.bases.b1 = batter;

  battingTeam.batterHistory[batter.id] = battingTeam.batterHistory[batter.id] || [];
  battingTeam.batterHistory[batter.id].push('BB');
  battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % battingTeam.lineup.length;

  checkInningProgress(state, runs);
  evaluateAutoPause(state);

  const res = makePitchResult('ストレート', 138, 'INTENTIONAL_WALK', runs, 0, desc, {
    pitchType: 'ストレート',
    pitchSpeedKmh: 138,
    pitchZone: 'BALL',
  });
  state.lastPitch = res;
  return res;
}

function handleDeadBall(
  state: LiveMatchState,
  batter: Player,
  battingTeam: LiveTeam,
  pBox: PitcherBoxScore,
  pitchType: string,
  speedKmh: number,
  desc: string,
): PitchOutcome {
  state.balls = 0;
  state.strikes = 0;
  pBox.hitByPitch = (pBox.hitByPitch ?? 0) + 1;

  const bBox = (state.isBottom ? state.boxScoreB : state.boxScoreA)[batter.id];
  if (bBox) bBox.hitByPitch = (bBox.hitByPitch ?? 0) + 1;

  // 押し出し判定
  let runs = 0;
  if (state.bases.b1 && state.bases.b2 && state.bases.b3) {
    runs = 1;
    if (state.isBottom) state.scoreB++;
    else state.scoreA++;
    const curLine = state.isBottom ? state.lineScoreB : state.lineScoreA;
    curLine[curLine.length - 1] = (curLine[curLine.length - 1] ?? 0) + 1;
  }
  if (state.bases.b1 && state.bases.b2) state.bases.b3 = state.bases.b2;
  if (state.bases.b1) state.bases.b2 = state.bases.b1;
  state.bases.b1 = batter;

  battingTeam.batterHistory[batter.id] = battingTeam.batterHistory[batter.id] || [];
  battingTeam.batterHistory[batter.id].push('HBP');
  battingTeam.currentBatterIndex = (battingTeam.currentBatterIndex + 1) % battingTeam.lineup.length;

  checkInningProgress(state, runs);
  evaluateAutoPause(state);

  const res = makePitchResult(pitchType, speedKmh, 'DEADBALL', runs, 0, desc, {
    pitchType,
    pitchSpeedKmh: speedKmh,
    pitchZone: 'BALL',
  });
  state.lastPitch = res;
  return res;
}

// ---------------------------------------------------------------------------
// イニング交代・試合終了判定
// ---------------------------------------------------------------------------

function checkInningProgress(state: LiveMatchState, _runsAdded: number): void {
  // 9回以降サヨナラ勝ち判定（裏で後攻が勝ち越し）
  if (state.inning >= 9 && state.isBottom && state.scoreB > state.scoreA) {
    state.isGameOver = true;
    state.winnerTeamId = state.teamB.id;
    state.playLog.unshift(`🎉 ゲームセット！ ${state.teamB.name}がサヨナラ勝ち！（${state.scoreA} - ${state.scoreB}）`);
    return;
  }

  // 3アウトチェンジ
  if (state.outs >= 3) {
    state.outs = 0;
    state.balls = 0;
    state.strikes = 0;
    state.bases = { b1: null, b2: null, b3: null };

    if (!state.isBottom) {
      // 表終了 -> 裏開始
      state.isBottom = true;
      state.lineScoreB.push(0);

      // 9回裏で後攻が既にリードしていればゲームセット（X）
      if (state.inning >= 9 && state.scoreB > state.scoreA) {
        state.isGameOver = true;
        state.winnerTeamId = state.teamB.id;
        state.lineScoreB[state.lineScoreB.length - 1] = -1; // X
        state.playLog.unshift(`🎉 ゲームセット！ ${state.teamB.name}の勝利！（${state.scoreA} - ${state.scoreB}）`);
        return;
      }
      state.playLog.unshift(`攻守交替：${state.inning}回裏 ${state.teamB.name}の攻撃へ`);
    } else {
      // 裏終了 -> 次イニング
      state.isBottom = false;
      // 9回終了時、同点でないならゲームセット
      if (state.inning >= 9 && state.scoreA !== state.scoreB) {
        state.isGameOver = true;
        state.winnerTeamId = state.scoreA > state.scoreB ? state.teamA.id : state.teamB.id;
        const winner = state.scoreA > state.scoreB ? state.teamA.name : state.teamB.name;
        state.playLog.unshift(`🎉 ゲームセット！ ${winner}の勝利！（${state.scoreA} - ${state.scoreB}）`);
        return;
      }
      state.inning++;
      state.lineScoreA.push(0);
      state.playLog.unshift(`攻守交替：${state.inning}回表 ${state.teamA.name}の攻撃へ`);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-Pause 自動一時停止判定
// ---------------------------------------------------------------------------

function evaluateAutoPause(state: LiveMatchState): void {
  state.autoPauseTrigger = null;
  if (!state.autoPauseEnabled || state.isGameOver) return;

  const playerBatting = (state.isBottom && state.teamB.isPlayerTeam) || (!state.isBottom && state.teamA.isPlayerTeam);
  const playerPitching = !playerBatting;

  // 1. 得点圏チャンス到来（プレイヤー攻撃時）
  if (playerBatting && (state.bases.b2 || state.bases.b3) && state.outs < 2) {
    state.autoPauseTrigger = 'CHANCE';
    return;
  }

  // 2. 終盤の大ピンチ（プレイヤー守備時・7回以降で走者あり）
  if (playerPitching && state.inning >= 7 && (state.bases.b1 || state.bases.b2 || state.bases.b3)) {
    state.autoPauseTrigger = 'PINCH';
    return;
  }

  // 3. 投手スタミナ警告
  const myTeam = state.teamA.isPlayerTeam ? state.teamA : state.teamB;
  const pState = myTeam.pitcher;
  if (pState.stamina / pState.maxStamina < 0.25 || pState.pitches >= 100) {
    state.autoPauseTrigger = 'STAMINA';
    return;
  }

  // 4. サヨナラの危機・チャンス
  if (state.inning >= 9 && state.isBottom && Math.abs(state.scoreA - state.scoreB) <= 1) {
    state.autoPauseTrigger = playerBatting ? 'CHANCE' : 'PINCH';
  }
}

function makePitchResult(
  pitchType: string,
  speedKmh: number,
  ballResult: PitchOutcome['ballResult'],
  runsScored: number,
  outsAdded: number,
  description: string,
  tracking: TrackingStats,
): PitchOutcome {
  return {
    pitchType,
    speedKmh,
    ballResult,
    runsScored,
    outsAdded,
    description,
    tracking,
  };
}

// ---------------------------------------------------------------------------
// 選手交代 ＆ 伝令
// ---------------------------------------------------------------------------

/** 投手交代 */
export function changePitcher(state: LiveMatchState, targetTeamId: string, newPitcherId: string): boolean {
  const team = state.teamA.id === targetTeamId ? state.teamA : state.teamB;
  const newP = team.bullpen.find((p) => p.id === newPitcherId) || team.bench.find((p) => p.id === newPitcherId);
  if (!newP) return false;

  const oldP = team.pitcher.player;
  team.bench.push(oldP);

  const maxStam = 70 + newP.abilities.stamina * 0.8;
  team.pitcher = {
    player: newP,
    pitches: 0,
    stamina: maxStam,
    maxStamina: maxStam,
    earnedRuns: 0,
    hitsAllowed: 0,
    strikeouts: 0,
    walks: 0,
  };
  team.bullpen = team.bullpen.filter((p) => p.id !== newPitcherId);
  team.bench = team.bench.filter((p) => p.id !== newPitcherId);

  // 投手ボックススコア登録
  const pBox = team.id === state.teamA.id ? state.pitcherBoxA : state.pitcherBoxB;
  if (!pBox[newP.id]) {
    pBox[newP.id] = {
      playerId: newP.id,
      name: `${newP.name.family} ${newP.name.given}`,
      inningsPitched: 0,
      hits: 0,
      runs: 0,
      earnedRuns: 0,
      walks: 0,
      strikeouts: 0,
      pitches: 0,
    };
  }

  state.playLog.unshift(`投手交代：${team.name}のマウンドへ ${newP.name.family}${newP.name.given} が登板！`);
  return true;
}

/** 代打 */
export function pinchHit(state: LiveMatchState, targetTeamId: string, orderIndex: number, newPlayerId: string): boolean {
  const team = state.teamA.id === targetTeamId ? state.teamA : state.teamB;
  const sub = team.bench.find((p) => p.id === newPlayerId);
  if (!sub || orderIndex < 0 || orderIndex >= team.lineup.length) return false;

  const old = team.lineup[orderIndex];
  team.lineup[orderIndex] = sub;
  team.bench = team.bench.filter((p) => p.id !== newPlayerId);

  const bBox = team.id === state.teamA.id ? state.boxScoreA : state.boxScoreB;
  if (!bBox[sub.id]) {
    bBox[sub.id] = {
      playerId: sub.id,
      name: `${sub.name.family} ${sub.name.given}`,
      position: 'PH',
      orderNumber: orderIndex + 1,
      atBats: 0,
      runs: 0,
      hits: 0,
      rbi: 0,
      strikeouts: 0,
      walks: 0,
      homeRuns: 0,
    };
  }

  state.playLog.unshift(`代打コール：${team.name}、${old.name.family}に代わり代打 ${sub.name.family}${sub.name.given}！`);
  return true;
}

/** 伝令を送る（公式戦最大3回、スタミナ回復+10%） */
export function sendMessenger(state: LiveMatchState, targetTeamId: string): boolean {
  const team = state.teamA.id === targetTeamId ? state.teamA : state.teamB;
  if (team.messagesLeft <= 0) return false;

  team.messagesLeft--;
  const heal = team.pitcher.maxStamina * 0.12;
  team.pitcher.stamina = Math.min(team.pitcher.maxStamina, team.pitcher.stamina + heal);

  state.playLog.unshift(`📣 伝令！内野陣がマウンドに集結して呼吸を整える（スタミナ小回復・残${team.messagesLeft}回）`);
  return true;
}

/** 申告敬遠（投球数消費ゼロで打者を一塁へ歩かせる） */
export function issueIntentionalWalk(state: LiveMatchState): PitchOutcome {
  const battingTeam = state.isBottom ? state.teamB : state.teamA;
  const pitchingTeam = state.isBottom ? state.teamA : state.teamB;
  const batter = battingTeam.lineup[battingTeam.currentBatterIndex % battingTeam.lineup.length];
  const pBoxMap = state.isBottom ? state.pitcherBoxA : state.pitcherBoxB;
  const pBox = pBoxMap[pitchingTeam.pitcher.player.id];
  const outcome = handleWalk(state, batter, battingTeam, pBox, `✋ 申告敬遠：${batter.name.family}を一塁へ歩かせる！`);
  state.playLog.unshift(outcome.description);
  return outcome;
}

// ---------------------------------------------------------------------------
// 開発・バランス検証用 5回高速シミュレーション
// ---------------------------------------------------------------------------

export interface SimPitcherInput {
  arm: number;
  form: number;
  control: number;
  breaking: number;
  stamina: number;
  guts: number;
  condition: number; // -5 .. +5
  throws: Handedness;
  traits?: string[];
}

export interface SimResult {
  matches: number;
  innings: number;
  pitches: number;
  pitchesPerInning: number;
  strikes: number;
  balls: number;
  strikeRate: number; // %
  walks: number;
  deadBalls: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  earnedRuns: number;
  strikeouts: number;
  k9: number; // 奪三振率 (K/9)
  era: number;
  maxSpeedKmh: number;
}

export function createAverageBatter(idx: number): Player {
  return {
    id: `opp-batter-${idx}`,
    name: { family: `平均`, given: `${idx}番` },
    faceSeed: '0123456789abcdef',
    grade: 2,
    position: idx === 1 ? 'CF' : idx === 2 ? '2B' : idx === 3 ? '3B' : idx === 4 ? '1B' : idx === 5 ? 'LF' : idx === 6 ? 'RF' : idx === 7 ? 'SS' : idx === 8 ? 'C' : 'P',
    throws: 'R',
    bats: idx % 2 === 0 ? 'L' : 'R',
    personality: 'NORMAL' as any,
    growthType: 'NORMAL',
    abilities: {
      power: 50,
      contact: 50,
      eye: 50,
      speed: 50,
      accel: 50,
      fielding: 50,
      guts: 50,
      arm: 50,
      control: 50,
      form: 50,
      judgment: 50,
      reaction: 50,
      breaking: 50,
      stamina: 50,
    },
    condition: 0,
    fatigue: 0,
    injury: null,
    traits: [],
  };
}

export function createTestPitcher(input: SimPitcherInput): Player {
  return {
    id: 'test-pitcher',
    name: { family: '検証', given: 'エース' },
    faceSeed: 'abcdef0123456789',
    grade: 3,
    position: 'P',
    throws: input.throws ?? 'R',
    bats: 'R',
    personality: 'COOL',
    growthType: 'NORMAL',
    abilities: {
      power: 40,
      contact: 40,
      eye: 40,
      speed: 50,
      accel: 50,
      fielding: 55,
      guts: input.guts,
      arm: input.arm,
      control: input.control,
      form: input.form,
      judgment: 55,
      reaction: 55,
      breaking: input.breaking,
      stamina: input.stamina,
    },
    condition: input.condition ?? 0,
    fatigue: 0,
    injury: null,
    traits: input.traits || [],
  };
}

export function simulateInnings(input: SimPitcherInput, targetInnings = 9, rng?: Rng): SimResult {
  const simRng = rng || new Rng(Date.now() ^ (Math.random() * 0x7fffffff));
  const oppRoster = Array.from({ length: 9 }, (_, i) => createAverageBatter(i + 1));
  const testPitcher = createTestPitcher(input);
  // 検証高校の野手陣（テスト投手が唯一の投手になるよう、野手ポジションに設定）
  const myFielders = oppRoster.map((p, idx) => ({
    ...p,
    id: `my-fielder-${idx + 1}`,
    position: (idx === 7 ? 'C' : 'OF') as any,
  }));
  const myRoster = [testPitcher, ...myFielders.slice(1)];

  const defaultStadium: StadiumSpec = {
    name: '標準球場',
    foulLine: 98,
    center: 120,
    fenceHeight: 3.0,
  };

  const state = createLiveMatch({
    matchId: `sim-${Date.now()}`,
    tournamentTitle: 'シミュレーション検証',
    roundName: `${targetInnings}回戦`,
    stadium: defaultStadium,
    teamA: {
      id: 'opp-team',
      name: '平均高校',
      prefecture: '福岡県',
      isPlayerTeam: false,
      roster: oppRoster,
      uniform: { capColor: '#334155', shirtColor: '#f1f5f9', pantsColor: '#f1f5f9', underShirtColor: '#334155' },
    },
    teamB: {
      id: 'test-team',
      name: '検証高校',
      prefecture: '福岡県',
      isPlayerTeam: true,
      roster: myRoster,
      uniform: { capColor: '#1e3a8a', shirtColor: '#ffffff', pantsColor: '#ffffff', underShirtColor: '#1e3a8a' },
    },
  });

  let totalPitches = 0;
  let strikes = 0;
  let balls = 0;
  let walks = 0;
  let deadBalls = 0;
  let singles = 0;
  let doubles = 0;
  let triples = 0;
  let homeRuns = 0;
  let strikeouts = 0;
  let runs = 0;
  let completedOuts = 0;
  const targetOuts = targetInnings * 3;
  const maxPitchesLimit = targetInnings * 45; // 9回なら約400球リミット

  // targetInnings（9回＝計27アウト）を投球
  while (completedOuts < targetOuts && totalPitches < maxPitchesLimit) {
    // 常に表（相手打線 vs テスト投手）
    state.isBottom = false;

    const outcome = stepPitch(state, simRng);
    totalPitches++;

    const isWalk = outcome.ballResult === 'INTENTIONAL_WALK' || outcome.description.includes('四球');
    const isDeadBall = outcome.ballResult === 'DEADBALL' || outcome.description.includes('死球');

    if (outcome.ballResult === 'BALL' || isWalk) {
      balls++;
    } else if (isDeadBall) {
      deadBalls++;
    } else {
      strikes++;
    }

    if (isWalk) {
      walks++;
    }

    if (outcome.description.includes('三振')) {
      strikeouts++;
    }

    if (outcome.inPlayOutcome === '1B') singles++;
    else if (outcome.inPlayOutcome === '2B') doubles++;
    else if (outcome.inPlayOutcome === '3B') triples++;
    else if (outcome.inPlayOutcome === 'HR') homeRuns++;

    runs += outcome.runsScored;
    completedOuts += outcome.outsAdded;

    // 3アウトチェンジが起きた場合のイニング進行
    if (state.isBottom) {
      state.isBottom = false;
      state.outs = 0;
      state.bases = { b1: null, b2: null, b3: null };
      state.inning++;
    }
  }

  const hits = singles + doubles + triples + homeRuns;
  const strikeRate = totalPitches > 0 ? (strikes / totalPitches) * 100 : 0;
  const era = (runs * 9) / targetInnings;
  const k9 = (strikeouts * 9) / targetInnings;
  const maxSpeedKmh = Math.round(pitchVelocity(input.arm, input.form, input.traits || []));

  return {
    matches: 1,
    innings: targetInnings,
    pitches: totalPitches,
    pitchesPerInning: Number((totalPitches / targetInnings).toFixed(1)),
    strikes,
    balls,
    strikeRate: Number(strikeRate.toFixed(1)),
    walks,
    deadBalls,
    hits,
    singles,
    doubles,
    triples,
    homeRuns,
    runs,
    earnedRuns: runs,
    strikeouts,
    k9: Number(k9.toFixed(2)),
    era: Number(era.toFixed(2)),
    maxSpeedKmh,
  };
}

export function simulateNineInnings(input: SimPitcherInput, rng?: Rng): SimResult {
  return simulateInnings(input, 9, rng);
}

export function simulateFiveInnings(input: SimPitcherInput, rng?: Rng): SimResult {
  return simulateInnings(input, 5, rng);
}

export function simulateMultipleMatches(input: SimPitcherInput, count = 10, targetInnings = 9): SimResult {
  const results: SimResult[] = [];
  for (let i = 0; i < count; i++) {
    results.push(simulateInnings(input, targetInnings));
  }

  const avg = (fn: (r: SimResult) => number) =>
    Number((results.reduce((sum, r) => sum + fn(r), 0) / count).toFixed(1));

  return {
    matches: count,
    innings: targetInnings,
    pitches: avg((r) => r.pitches),
    pitchesPerInning: avg((r) => r.pitchesPerInning),
    strikes: avg((r) => r.strikes),
    balls: avg((r) => r.balls),
    strikeRate: avg((r) => r.strikeRate),
    walks: avg((r) => r.walks),
    deadBalls: avg((r) => r.deadBalls),
    hits: avg((r) => r.hits),
    singles: avg((r) => r.singles),
    doubles: avg((r) => r.doubles),
    triples: avg((r) => r.triples),
    homeRuns: avg((r) => r.homeRuns),
    runs: avg((r) => r.runs),
    earnedRuns: avg((r) => r.earnedRuns),
    strikeouts: avg((r) => r.strikeouts),
    k9: Number((results.reduce((sum, r) => sum + r.k9, 0) / count).toFixed(2)),
    era: Number((results.reduce((sum, r) => sum + r.era, 0) / count).toFixed(2)),
    maxSpeedKmh: results[0].maxSpeedKmh,
  };
}
