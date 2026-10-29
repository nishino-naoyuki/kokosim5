import { pitchVelocity } from './abilities';
import { clamp, type Rng } from './rng';
import type { Player } from './types';

/**
 * 他校試合の高速シミュレーション（Inning-by-Inning Sim）。
 * school_master_and_tournament_specification.md 5章。
 * 「○%で番狂わせ」のような作為的フラグは一切使わず、打席ごとの確率の積み重ねで結果を決める。
 */

export interface TeamProfile {
  id: string;
  name: string;
  /** 打順 1〜9 */
  lineup: Player[];
  /** 投手（先発→救援の順） */
  pitchers: Player[];
}

export interface GameResult {
  winnerId: string;
  /** 先攻（teamA）・後攻（teamB）の得点 */
  scoreA: number;
  scoreB: number;
  innings: number;
  lineScoreA: number[];
  lineScoreB: number[];
  hitsA: number;
  hitsB: number;
  errorsA: number;
  errorsB: number;
}

/** 名簿から実戦用チーム構成（打順9人＋投手陣）を自動編成する */
export function buildTeamProfile(id: string, name: string, roster: readonly Player[]): TeamProfile {
  const healthy = roster.filter((p) => !p.injury);
  const pitchers = healthy
    .filter((p) => p.position === 'P')
    .sort((a, b) => pitcherScore(b) - pitcherScore(a));
  const batterScore = (p: Player) =>
    p.abilities.power * 0.3 + p.abilities.contact * 0.35 + p.abilities.eye * 0.15 + p.abilities.speed * 0.1 + p.abilities.guts * 0.1;
  const fielders = healthy.filter((p) => p.position !== 'P').sort((a, b) => batterScore(b) - batterScore(a));
  // 投手が足りない場合は野手から補充
  while (pitchers.length < 2 && fielders.length > 9) pitchers.push(fielders.pop()!);
  const lineup = fielders.slice(0, 9);
  // 打撃の良い順に並べ、2番に巧打者・4番に長打者を置く簡易打順
  const sorted = lineup.slice().sort((a, b) => batterScore(b) - batterScore(a));
  const order: Player[] = [];
  const slots = [3, 0, 1, 2, 4, 5, 6, 7, 8]; // 打順1〜9 に入れる sorted の index
  for (const idx of slots) if (sorted[idx]) order.push(sorted[idx]);
  return { id, name, lineup: order.length ? order : lineup, pitchers };
}

function pitcherScore(p: Player): number {
  const v = pitchVelocity(p.abilities.arm, p.abilities.form, p.traits);
  return velocityScore(v) * 0.3 + p.abilities.control * 0.3 + p.abilities.breaking * 0.25 + p.abilities.stamina * 0.15;
}

/** 球速を 0〜100 の指標へ（110km/h→0, 160km/h→100） */
function velocityScore(kmh: number): number {
  return clamp(((kmh - 110) / 50) * 100, 0, 100);
}

interface PitcherState {
  player: Player;
  pitches: number;
}

/** 球数上限の目安（スタミナ依存）。超えると急速に球威が落ちる。 */
function pitchLimit(p: Player): number {
  return 70 + p.abilities.stamina * 0.8;
}

function effectiveStuff(ps: PitcherState): number {
  const p = ps.player;
  const stuff = velocityScore(pitchVelocity(p.abilities.arm, p.abilities.form, p.traits)) * 0.35 + p.abilities.breaking * 0.3 + p.abilities.control * 0.35;
  const limit = pitchLimit(p);
  const over = Math.max(0, ps.pitches - limit * 0.75);
  const fatiguePenalty = (over / (limit * 0.25)) * 20;
  const conditionBonus = p.condition * 1.2;
  const intimidation = 0;
  return stuff - fatiguePenalty + conditionBonus + intimidation;
}

type PaOutcome = 'K' | 'BB' | 'OUT' | 'ERR' | '1B' | '2B' | 'HR';

function plateAppearance(
  batter: Player,
  pitcher: PitcherState,
  defenseFielding: number,
  intimidation: { pitcher: number; batter: number },
  rng: Rng,
): { outcome: PaOutcome; pitches: number } {
  const a = batter.abilities;
  const stuff = effectiveStuff(pitcher) + intimidation.pitcher;
  const hit = a.contact + a.power * 0.2 + intimidation.batter + batter.condition * 1.2;

  const pBB = clamp(0.085 + (a.eye - pitcher.player.abilities.control) * 0.0014, 0.03, 0.17);
  const pK = clamp(0.18 + (stuff - a.contact) * 0.0035, 0.06, 0.4);
  const r = rng.next();
  const pitches = Math.round(rng.float(3, 5.2));
  if (r < pBB) return { outcome: 'BB', pitches: pitches + 1 };
  if (r < pBB + pK) return { outcome: 'K', pitches: pitches + 1 };

  // インプレー
  const pHitInPlay = clamp(0.29 + (hit - stuff) * 0.0022 + (a.speed - 50) * 0.0004, 0.16, 0.45);
  if (!rng.chance(pHitInPlay)) {
    const pErr = clamp(0.045 + (55 - defenseFielding) * 0.0009, 0.012, 0.11);
    return { outcome: rng.chance(pErr) ? 'ERR' : 'OUT', pitches };
  }
  const pHR = clamp(0.035 + (a.power - 50) * 0.0017 + (hit - stuff) * 0.0006, 0.004, 0.2);
  const p2B = clamp(0.2 + (a.power - 50) * 0.0012 + (a.speed - 50) * 0.0008, 0.1, 0.34);
  const t = rng.next();
  if (t < pHR) return { outcome: 'HR', pitches };
  if (t < pHR + p2B) return { outcome: '2B', pitches };
  return { outcome: '1B', pitches };
}

interface Bases {
  b1: Player | null;
  b2: Player | null;
  b3: Player | null;
}

/** 走者を進塁させ、得点数を返す */
function advance(
  bases: Bases,
  outcome: PaOutcome,
  batter: Player,
  outs: number,
  rng: Rng,
): { runs: number; extraOuts: number } {
  let runs = 0;
  let extraOuts = 0;
  const speedOf = (p: Player | null) => (p ? p.abilities.speed : 50);
  switch (outcome) {
    case 'HR':
      runs = 1 + [bases.b1, bases.b2, bases.b3].filter(Boolean).length;
      bases.b1 = bases.b2 = bases.b3 = null;
      break;
    case '2B': {
      if (bases.b3) runs++;
      if (bases.b2) runs++;
      const b1 = bases.b1;
      bases.b3 = null;
      bases.b2 = batter;
      if (b1) {
        if (rng.chance(clamp(0.4 + (speedOf(b1) - 50) * 0.006, 0.15, 0.85))) runs++;
        else bases.b3 = b1;
      }
      bases.b1 = null;
      break;
    }
    case '1B': {
      if (bases.b3) runs++;
      const b2 = bases.b2;
      const b1 = bases.b1;
      bases.b3 = null;
      bases.b2 = null;
      if (b2) {
        if (rng.chance(clamp(0.6 + (speedOf(b2) - 50) * 0.006, 0.3, 0.9))) runs++;
        else bases.b3 = b2;
      }
      if (b1) {
        if (!bases.b3 && rng.chance(clamp(0.28 + (speedOf(b1) - 50) * 0.005, 0.1, 0.55))) bases.b3 = b1;
        else bases.b2 = b1;
      }
      bases.b1 = batter;
      break;
    }
    case 'BB':
    case 'ERR': {
      // フォース進塁（失策は1つ余分に進む走者あり）
      if (bases.b1 && bases.b2 && bases.b3) runs++;
      if (bases.b1 && bases.b2) bases.b3 = bases.b2;
      if (bases.b1) bases.b2 = bases.b1;
      bases.b1 = batter;
      if (outcome === 'ERR' && bases.b3 === null && bases.b2 && rng.chance(0.3)) {
        bases.b3 = bases.b2;
        bases.b2 = null;
      }
      break;
    }
    case 'OUT': {
      if (outs < 2) {
        // 併殺
        if (bases.b1 && rng.chance(0.12)) {
          extraOuts = 1;
          bases.b1 = null;
          break;
        }
        // 犠牲フライ・進塁打
        if (bases.b3 && rng.chance(0.32)) {
          runs++;
          bases.b3 = null;
        } else if (bases.b2 && !bases.b3 && rng.chance(0.15)) {
          bases.b3 = bases.b2;
          bases.b2 = null;
        }
      }
      break;
    }
    case 'K':
      break;
  }
  return { runs, extraOuts };
}

const MAX_INNINGS = 30;
/** タイブレーク開始回（無死一・二塁） */
export const TIEBREAK_INNING = 10;

/**
 * 1試合（9回、同点ならタイブレーク）をシミュレートする。teamA が先攻。
 */
export function simulateGame(teamA: TeamProfile, teamB: TeamProfile, rng: Rng): GameResult {
  const lineScoreA: number[] = [];
  const lineScoreB: number[] = [];
  let hitsA = 0;
  let hitsB = 0;
  let errorsA = 0;
  let errorsB = 0;
  let idxA = 0;
  let idxB = 0;
  const pitA: PitcherState[] = [{ player: teamA.pitchers[0] ?? teamA.lineup[0], pitches: 0 }];
  const pitB: PitcherState[] = [{ player: teamB.pitchers[0] ?? teamB.lineup[0], pitches: 0 }];

  const defenseOf = (t: TeamProfile) =>
    t.lineup.reduce((s, p) => s + p.abilities.fielding, 0) / Math.max(1, t.lineup.length);
  const defA = defenseOf(teamA);
  const defB = defenseOf(teamB);

  const intimidationOf = (batting: TeamProfile, pitching: PitcherState) => ({
    pitcher: pitching.player.traits.includes('マウンドの威圧感') ? -10 : 0,
    batter: batting.lineup.some((p) => p.traits.includes('スラッガーの威圧感')) ? 3 : 0,
  });

  const nextPitcher = (team: TeamProfile, stack: PitcherState[]) => {
    const cur = stack[stack.length - 1];
    if (cur.pitches > pitchLimit(cur.player)) {
      const used = new Set(stack.map((s) => s.player.id));
      const next = team.pitchers.find((p) => !used.has(p.id));
      if (next) stack.push({ player: next, pitches: 0 });
    }
    return stack[stack.length - 1];
  };

  let scoreA = 0;
  let scoreB = 0;
  let inning = 1;

  const playHalf = (
    batting: TeamProfile,
    pitching: TeamProfile,
    pitStack: PitcherState[],
    defense: number,
    idx: number,
    walkOffCheck?: (runsInHalf: number) => boolean,
  ) => {
    const bases: Bases = { b1: null, b2: null, b3: null };
    if (inning >= TIEBREAK_INNING) {
      // タイブレーク：無死一・二塁（前の打者2人を走者に）
      const n = batting.lineup.length;
      bases.b2 = batting.lineup[(idx + n - 1) % n];
      bases.b1 = batting.lineup[(idx + n - 2) % n];
    }
    let outs = 0;
    let runs = 0;
    let hits = 0;
    let errors = 0;
    while (outs < 3) {
      const pitcher = nextPitcher(pitching, pitStack);
      const batter = batting.lineup[idx % batting.lineup.length];
      idx++;
      const pa = plateAppearance(batter, pitcher, defense, intimidationOf(batting, pitcher), rng);
      pitcher.pitches += pa.pitches;
      const adv = advance(bases, pa.outcome, batter, outs, rng);
      runs += adv.runs;
      if (pa.outcome === '1B' || pa.outcome === '2B' || pa.outcome === 'HR') hits++;
      if (pa.outcome === 'ERR') errors++;
      if (pa.outcome === 'K' || pa.outcome === 'OUT') outs += 1 + adv.extraOuts;
      // サヨナラ判定（9回以降の後攻）：リードした時点で即終了
      if (walkOffCheck && runs > 0 && walkOffCheck(runs)) break;
    }
    return { runs, hits, errors, idx };
  };

  while (inning <= MAX_INNINGS) {
    const top = playHalf(teamA, teamB, pitB, defB, idxA);
    idxA = top.idx;
    scoreA += top.runs;
    hitsA += top.hits;
    errorsB += top.errors;
    lineScoreA.push(top.runs);

    // 9回以降、後攻がリードなら裏は行わない
    if (inning >= 9 && scoreB > scoreA) {
      lineScoreB.push(-1); // 'X'（裏の攻撃なし）
      break;
    }
    const bot = playHalf(
      teamB,
      teamA,
      pitA,
      defA,
      idxB,
      inning >= 9 ? (runsInHalf) => scoreB + runsInHalf > scoreA : undefined,
    );
    idxB = bot.idx;
    scoreB += bot.runs;
    hitsB += bot.hits;
    errorsA += bot.errors;
    lineScoreB.push(bot.runs);

    if (inning >= 9 && scoreA !== scoreB) break;
    inning++;
  }

  let winnerId: string;
  if (scoreA > scoreB) winnerId = teamA.id;
  else if (scoreB > scoreA) winnerId = teamB.id;
  else winnerId = rng.chance(0.5) ? teamA.id : teamB.id; // 30回でも決着しない極稀なケース

  return {
    winnerId,
    scoreA,
    scoreB,
    innings: lineScoreA.length,
    lineScoreA,
    lineScoreB,
    hitsA,
    hitsB,
    errorsA,
    errorsB,
  };
}
