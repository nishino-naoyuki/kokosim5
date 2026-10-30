import { createAbilities, pitchVelocity } from './abilities';
import { clamp, Rng } from './rng';
import type { MonsterKind, Player, SchoolMaster } from './types';

/**
 * 「10年に1人の怪物」システム（設計書 3.2.1）。
 * 全国4,000校×10名＝毎年40,000人の中で、年間10%（10年に1度）の確率で全国のどこかに1名だけ誕生する。
 * 個人レベルでは 40万分の1。自校（10枠）に入部する確率は約4万分の1。
 */
export const MONSTER_ANNUAL_PROBABILITY = 0.1;
export const FRESHMEN_PER_SCHOOL = 10;

export interface MonsterAssignment {
  kind: MonsterKind;
  schoolId: string;
  /** その学年内の何番目の新入生か（0〜9） */
  slot: number;
}

/**
 * その年に怪物が誕生するか、誕生する場合はどの学校のどの枠かを決定する。
 * スカウト契約の有無に関わらず抽選は全校一様（安売りしない）。
 */
export function rollAnnualMonster(
  schools: readonly Pick<SchoolMaster, 'id'>[],
  year: number,
  worldSeed: string | number,
): MonsterAssignment | null {
  if (schools.length === 0) return null;
  const rng = new Rng(`${worldSeed}/monster/${year}`);
  if (!rng.chance(MONSTER_ANNUAL_PROBABILITY)) return null;
  const kind: MonsterKind = rng.chance(0.5) ? 'PITCHER' : 'BATTER';
  const school = schools[rng.int(0, schools.length - 1)];
  return { kind, schoolId: school.id, slot: rng.int(0, FRESHMEN_PER_SCHOOL - 1) };
}

export const MONSTER_PITCHER_TRAITS = ['怪童', 'ドクターK', 'マウンドの威圧感'] as const;
export const MONSTER_BATTER_TRAITS = ['怪力アーチスト', 'スラッガーの威圧感', '勝負師'] as const;

/** 怪物としての初期能力・性格・成長タイプ・金特を選手へ上書きする（1年4月時点）。 */
export function applyMonster(player: Player, kind: MonsterKind, rng: Rng): void {
  const a = createAbilities(0);
  const base = (lo: number, hi: number) => rng.float(lo, hi);

  if (kind === 'PITCHER') {
    // 目標球速 150〜155km/h（怪童 +5 を含む）→ 素の球速 145〜150km/h になるよう肩・フォームを設定
    // 新球速式: V = 100 + 35x + 30x^2, 30x^2 + 35x + (100 - targetV) = 0
    const targetV = rng.float(150, 155) - 5;
    const form = rng.float(80, 88);
    // 2次方程式の解: x = (-35 + sqrt(35^2 - 4 * 30 * (100 - targetV))) / 60
    const targetX = (-35 + Math.sqrt(1225 + 120 * (targetV - 100))) / 60;
    // targetX = (0.55 * arm + 0.45 * form) / 100
    const arm = clamp((targetX * 100 - 0.45 * form) / 0.55, 70, 95);
    a.arm = arm;
    a.form = form;
    a.control = base(75, 82);
    a.stamina = base(82, 88);
    a.breaking = base(80, 90);
    a.guts = base(70, 85);
    a.power = base(40, 55);
    a.contact = base(40, 55);
    a.eye = base(40, 55);
    a.speed = base(50, 65);
    a.accel = base(50, 65);
    a.fielding = base(55, 70);
    a.judgment = base(60, 75);
    a.reaction = base(55, 70);
    player.position = 'P';
    player.traits = [...MONSTER_PITCHER_TRAITS];
  } else {
    a.power = base(88, 95);
    a.contact = base(76, 84);
    a.speed = base(75, 82);
    a.accel = base(72, 80);
    a.arm = base(72, 80);
    a.fielding = base(72, 80);
    a.eye = base(85, 92);
    a.guts = base(85, 92);
    a.judgment = base(70, 82);
    a.reaction = base(72, 82);
    a.control = base(40, 55);
    a.form = base(40, 55);
    a.breaking = base(30, 45);
    a.stamina = base(65, 80);
    if (player.position === 'P') player.position = 'CF';
    player.traits = [...MONSTER_BATTER_TRAITS];
  }
  player.abilities = a;
  player.personality = 'GENIUS';
  player.growthType = rng.chance(0.5) ? 'SUPER_EARLY' : 'NORMAL';
  player.monster = kind;
}

/** 怪物投手の素の最高球速（検証・表示用） */
export function monsterVelocity(player: Player): number {
  return pitchVelocity(player.abilities.arm, player.abilities.form, player.traits);
}
