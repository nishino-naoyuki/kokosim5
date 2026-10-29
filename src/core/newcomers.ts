import { createAbilities } from './abilities';
import { GROWTH_TYPE_TABLE, PERSONALITY_TABLE } from './constants';
import { generateFaceSeed } from './face';
import { FRESHMEN_PER_SCHOOL, applyMonster, type MonsterAssignment } from './monster';
import { generateUniqueName } from './names';
import { ABILITY_KEYS, type AbilityKey, type GrowthType, type Personality, type Player, type Position, type SchoolMaster } from './types';
import { clamp, Rng } from './rng';

/** プレイヤー校のスカウト契約（設計書 3.3） */
export type ScoutTier = 'NONE' | 'REGIONAL' | 'NATIONAL' | 'ELITE';

export const SCOUT_TABLE: Record<ScoutTier, { label: string; annualCost: number }> = {
  NONE: { label: '一般スカウト（自前）', annualCost: 0 },
  REGIONAL: { label: '地域ベテランスカウト', annualCost: 500_000 },
  NATIONAL: { label: '全国敏腕スカウト', annualCost: 1_500_000 },
  ELITE: { label: '元プロ名スカウト', annualCost: 3_000_000 },
};

export interface FreshmenOptions {
  scout?: ScoutTier;
  /** この学校・この年に怪物が割り当てられている場合 */
  monster?: Pick<MonsterAssignment, 'kind' | 'slot'> | null;
  /** 校内の既存部員の氏名（同姓同名回避用 "姓名"） */
  existingNames?: ReadonlySet<string>;
}

/** 新入生の初期能力の平均値：基準戦力 0〜100 → 約 25〜65 */
export function freshmanMean(baseRating: number): number {
  return 25 + 0.4 * clamp(baseRating, 0, 100);
}

/** 新入生の初期能力のばらつき：σ = σ_base × (100 − 安定度) / 50（下限あり） */
export function freshmanSigma(stability: number): number {
  const SIGMA_BASE = 8;
  return Math.max(3, (SIGMA_BASE * (100 - clamp(stability, 0, 100))) / 50);
}

/** 1学年10名のポジション構成（投3・捕1・内野3・外野3） */
const POSITION_TEMPLATE: readonly ('P' | 'C' | 'IF' | 'OF')[] = [
  'P', 'P', 'P', 'C', 'IF', 'IF', 'IF', 'OF', 'OF', 'OF',
];
const IF_POSITIONS: Position[] = ['1B', '2B', '3B', 'SS'];
const OF_POSITIONS: Position[] = ['LF', 'CF', 'RF'];

const POSITION_BIAS: Record<Position, Partial<Record<AbilityKey, number>>> = {
  P: { arm: 6, form: 6, control: 6, breaking: 6, stamina: 6, power: -5, contact: -5, eye: -3 },
  C: { arm: 6, fielding: 6, judgment: 6 },
  '1B': { power: 6, contact: 3 },
  '2B': { fielding: 5, reaction: 5, judgment: 3 },
  '3B': { arm: 5, fielding: 4, power: 3 },
  SS: { fielding: 6, reaction: 6, arm: 5 },
  LF: { power: 3, speed: 3 },
  CF: { speed: 6, accel: 6, arm: 3 },
  RF: { arm: 6, power: 3 },
};

const ELITE_TRAITS: Partial<Record<Position, readonly string[]>> = {
  P: ['奪三振'],
  C: ['キャッチャー◎'],
  '1B': ['パワーヒッター'],
};

function weightedPersonality(rng: Rng, scout: ScoutTier): Personality {
  const items = (Object.keys(PERSONALITY_TABLE) as Personality[]).map((p) => {
    let w = PERSONALITY_TABLE[p].weight;
    if (scout === 'REGIONAL' && p === 'DILIGENT') w *= 1.5; // 努力家の獲得率UP
    return [p, w] as const;
  });
  return rng.weighted(items);
}

function weightedGrowthType(rng: Rng): GrowthType {
  return rng.weighted(
    (Object.keys(GROWTH_TYPE_TABLE) as GrowthType[]).map((g) => [g, GROWTH_TYPE_TABLE[g].weight] as const),
  );
}

/**
 * 学校 `school` の `year` 年度の新入生10名を決定論的に生成する。
 * 同じ (worldSeed, school, year) からは常に同じ結果になる。
 */
export function generateFreshmen(
  school: Pick<SchoolMaster, 'id' | 'prefecture' | 'baseRating' | 'stability'>,
  year: number,
  worldSeed: string | number,
  opts: FreshmenOptions = {},
): Player[] {
  const scout = opts.scout ?? 'NONE';
  const root = new Rng(`${worldSeed}/freshmen/${year}/${school.id}`);
  const taken = new Set<string>(opts.existingNames ?? []);

  const effectiveRating = school.baseRating + (scout === 'NATIONAL' ? 10 : 0);
  const mu = freshmanMean(effectiveRating);
  const sigma = freshmanSigma(school.stability);

  // 元プロ名スカウト：天才肌の特級新入生を確実に1名（怪物枠とは別の枠）
  let eliteSlot = -1;
  if (scout === 'ELITE') {
    do {
      eliteSlot = root.int(0, FRESHMEN_PER_SCHOOL - 1);
    } while (opts.monster && eliteSlot === opts.monster.slot);
  }

  const players: Player[] = [];
  for (let i = 0; i < FRESHMEN_PER_SCHOOL; i++) {
    const rng = root.fork(`slot${i}`);
    const tpl = POSITION_TEMPLATE[i];
    const position: Position =
      tpl === 'IF' ? rng.pick(IF_POSITIONS) : tpl === 'OF' ? rng.pick(OF_POSITIONS) : tpl;

    // 選手共通の素質 z と能力ごとの個別ブレ
    const z = rng.normal(0, 1);
    const abilities = createAbilities(0);
    for (const key of ABILITY_KEYS) {
      const bias = POSITION_BIAS[position][key] ?? 0;
      abilities[key] = clamp(mu + sigma * (0.6 * z + 0.8 * rng.normal(0, 1)) + bias, 5, 90);
    }
    // 加速（隠し値）は走力と相関
    abilities.accel = clamp(abilities.speed + rng.normal(0, 5), 5, 95);

    const player: Player = {
      id: `${school.id}-${year}-${i + 1}`,
      name: generateUniqueName(school.prefecture, taken, rng),
      faceSeed: generateFaceSeed(rng),
      grade: 1,
      position,
      throws: rng.chance(0.8) ? 'R' : 'L',
      bats: rng.weighted([['R', 60], ['L', 30], ['S', 10]] as const),
      personality: weightedPersonality(rng, scout),
      growthType: weightedGrowthType(rng),
      abilities,
      condition: 0,
      fatigue: 0,
      injury: null,
      traits: [],
    };

    if (i === eliteSlot) {
      player.personality = 'GENIUS';
      for (const key of ABILITY_KEYS) player.abilities[key] = clamp(player.abilities[key] + 10, 5, 95);
      const specials = ELITE_TRAITS[player.position] ?? ['アベレージヒッター'];
      player.traits = [rng.pick(specials)];
    }

    if (opts.monster && opts.monster.slot === i) {
      applyMonster(player, opts.monster.kind, rng.fork('monster'));
    }
    players.push(player);
  }
  return players;
}
